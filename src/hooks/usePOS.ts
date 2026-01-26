import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { 
  POSTransaction, 
  PaymentMethod, 
  PaymentRequest,
  TransactionStatus 
} from '@/types/pos';
import { 
  initPOSDatabase, 
  saveTransaction, 
  getAllTransactions,
  updateTransactionStatus 
} from '@/services/posStorage';
import { 
  initializePaymentSDK, 
  processPayment, 
  isPaymentAvailable 
} from '@/services/posPayment';
import { 
  startSyncService, 
  stopSyncService, 
  syncPendingTransactions,
  isOnlineStatus 
} from '@/services/posSync';
import { toast } from 'sonner';

interface UsePOSReturn {
  isInitialized: boolean;
  isProcessing: boolean;
  isOnline: boolean;
  transactions: POSTransaction[];
  currentTransaction: POSTransaction | null;
  pendingSyncCount: number;
  
  initializePOS: () => Promise<void>;
  makePayment: (amount: number, method: PaymentMethod, options?: { customerName?: string; tabId?: string }) => Promise<POSTransaction>;
  cancelCurrentTransaction: () => void;
  syncNow: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
}

export function usePOS(): UsePOSReturn {
  const { user, company } = useAuthContext();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [transactions, setTransactions] = useState<POSTransaction[]>([]);
  const [currentTransaction, setCurrentTransaction] = useState<POSTransaction | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshTransactions = useCallback(async () => {
    if (!company?.id) return;
    
    const txns = await getAllTransactions(company.id);
    setTransactions(txns);
    
    const pending = txns.filter(t => t.status === 'approved' && !t.syncedAt);
    setPendingSyncCount(pending.length);
  }, [company?.id]);

  const initializePOS = useCallback(async () => {
    try {
      // Initialize IndexedDB
      await initPOSDatabase();
      
      // Initialize payment SDK (simulator by default)
      await initializePaymentSDK('simulator');
      
      // Start sync service
      startSyncService();
      
      // Load transactions
      await refreshTransactions();
      
      setIsInitialized(true);
      console.log('[POS] System initialized');
    } catch (error) {
      console.error('[POS] Initialization error:', error);
      toast.error('Erro ao inicializar POS');
      throw error;
    }
  }, [refreshTransactions]);

  const makePayment = useCallback(async (
    amount: number, 
    method: PaymentMethod,
    options?: { customerName?: string; tabId?: string }
  ): Promise<POSTransaction> => {
    if (!user || !company) {
      throw new Error('Usuário não autenticado');
    }

    if (!isInitialized) {
      throw new Error('POS não inicializado');
    }

    setIsProcessing(true);

    // Create local transaction record
    const localId = crypto.randomUUID();
    const transaction: POSTransaction = {
      id: '',
      localId,
      companyId: company.id,
      operatorId: user.id,
      amount,
      paymentMethod: method,
      status: 'processing',
      customerName: options?.customerName,
      tabId: options?.tabId,
      createdAt: new Date(),
    };

    setCurrentTransaction(transaction);

    try {
      // Save pending transaction locally
      await saveTransaction(transaction);

      // Process payment
      const request: PaymentRequest = {
        amount,
        paymentMethod: method,
        customerName: options?.customerName,
        tabId: options?.tabId,
      };

      const response = await processPayment(request);

      // Update transaction with result
      const updatedTransaction: POSTransaction = {
        ...transaction,
        status: response.success ? 'approved' : 'declined',
        nsu: response.nsu,
        authorizationCode: response.authorizationCode,
        cardBrand: response.cardBrand,
        cardLastDigits: response.cardLastDigits,
        errorMessage: response.errorMessage,
        processedAt: new Date(),
      };

      await saveTransaction(updatedTransaction);
      setCurrentTransaction(updatedTransaction);

      if (response.success) {
        toast.success('Pagamento aprovado!');
        
        // Try immediate sync if online
        if (isOnline) {
          syncPendingTransactions();
        }
      } else {
        toast.error(response.errorMessage || 'Pagamento recusado');
      }

      await refreshTransactions();
      return updatedTransaction;

    } catch (error) {
      console.error('[POS] Payment error:', error);
      
      await updateTransactionStatus(localId, 'error', {
        errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
      });

      toast.error('Erro ao processar pagamento');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [user, company, isInitialized, isOnline, refreshTransactions]);

  const cancelCurrentTransaction = useCallback(() => {
    setCurrentTransaction(null);
  }, []);

  const syncNow = useCallback(async () => {
    if (!isOnline) {
      toast.error('Sem conexão com internet');
      return;
    }

    const result = await syncPendingTransactions();
    
    if (result.synced > 0) {
      toast.success(`${result.synced} transação(ões) sincronizada(s)`);
    }
    
    if (result.failed > 0) {
      toast.warning(`${result.failed} transação(ões) pendente(s)`);
    }

    await refreshTransactions();
  }, [isOnline, refreshTransactions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSyncService();
    };
  }, []);

  return {
    isInitialized,
    isProcessing,
    isOnline,
    transactions,
    currentTransaction,
    pendingSyncCount,
    initializePOS,
    makePayment,
    cancelCurrentTransaction,
    syncNow,
    refreshTransactions,
  };
}
