import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePOS } from '@/hooks/usePOS';
import { POSHeader } from '@/components/pos/POSHeader';
import { POSKeypad } from '@/components/pos/POSKeypad';
import { POSPaymentMethods } from '@/components/pos/POSPaymentMethods';
import { POSTransactionResult } from '@/components/pos/POSTransactionResult';
import { POSHistory } from '@/components/pos/POSHistory';
import { PaymentMethod, POSTransaction } from '@/types/pos';
import { toast } from 'sonner';

type POSScreen = 'amount' | 'payment' | 'processing' | 'result';

export default function POS() {
  const navigate = useNavigate();
  const { signOut, user, company, loading: authLoading } = useAuthContext();
  
  const {
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
  } = usePOS();

  const [screen, setScreen] = useState<POSScreen>('amount');
  const [amountValue, setAmountValue] = useState('0');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<POSTransaction | null>(null);

  // Initialize POS on mount
  useEffect(() => {
    if (user && company && !isInitialized) {
      initializePOS();
    }
  }, [user, company, isInitialized, initializePOS]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, user, navigate]);

  const amount = parseInt(amountValue, 10) / 100;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleProceedToPayment = () => {
    if (amount <= 0) {
      toast.error('Digite um valor válido');
      return;
    }
    setScreen('payment');
  };

  const handleSelectMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
  };

  const handleConfirmPayment = async () => {
    if (!selectedMethod) {
      toast.error('Selecione uma forma de pagamento');
      return;
    }

    setScreen('processing');

    try {
      const result = await makePayment(amount, selectedMethod, {
        customerName: customerName || undefined,
      });
      setLastResult(result);
      setScreen('result');
    } catch (error) {
      setScreen('payment');
    }
  };

  const handleNewTransaction = () => {
    setAmountValue('0');
    setSelectedMethod(null);
    setCustomerName('');
    setLastResult(null);
    cancelCurrentTransaction();
    setScreen('amount');
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  if (authLoading || !isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Inicializando POS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <POSHeader
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        onSync={handleSync}
        onLogout={handleLogout}
        onShowHistory={() => setShowHistory(true)}
        syncing={syncing}
      />

      <main className="flex-1 p-4 flex flex-col">
        {/* Amount Screen */}
        {screen === 'amount' && (
          <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full">
            <Card className="flex-shrink-0">
              <CardContent className="pt-6">
                <div className="text-center mb-6">
                  <p className="text-sm text-muted-foreground mb-1">Valor</p>
                  <p className="text-4xl font-bold">{formatCurrency(amount)}</p>
                </div>
                <POSKeypad
                  value={amountValue}
                  onChange={setAmountValue}
                  disabled={isProcessing}
                />
              </CardContent>
            </Card>

            <div className="space-y-3">
              <div>
                <Label htmlFor="customerName" className="text-sm">
                  Nome do Cliente (opcional)
                </Label>
                <Input
                  id="customerName"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="h-12 text-lg"
                />
              </div>

              <Button
                className="w-full h-16 text-xl font-bold"
                onClick={handleProceedToPayment}
                disabled={amount <= 0}
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Payment Method Screen */}
        {screen === 'payment' && (
          <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center mb-6">
                  <p className="text-sm text-muted-foreground mb-1">Valor a Cobrar</p>
                  <p className="text-4xl font-bold">{formatCurrency(amount)}</p>
                  {customerName && (
                    <p className="text-sm text-muted-foreground mt-1">{customerName}</p>
                  )}
                </div>

                <div className="mb-6">
                  <p className="text-sm text-muted-foreground mb-3 text-center">
                    Selecione a forma de pagamento
                  </p>
                  <POSPaymentMethods
                    selected={selectedMethod}
                    onSelect={handleSelectMethod}
                    disabled={isProcessing}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-14 text-lg"
                onClick={() => setScreen('amount')}
              >
                Voltar
              </Button>
              <Button
                className="flex-1 h-14 text-lg font-bold"
                onClick={handleConfirmPayment}
                disabled={!selectedMethod}
              >
                Pagar
              </Button>
            </div>
          </div>
        )}

        {/* Processing Screen */}
        {screen === 'processing' && (
          <div className="flex-1 flex items-center justify-center">
            <Card className="w-full max-w-md">
              <CardContent className="py-12 text-center">
                <Loader2 className="h-16 w-16 animate-spin mx-auto text-primary mb-4" />
                <p className="text-xl font-semibold mb-2">Processando Pagamento</p>
                <p className="text-4xl font-bold mb-4">{formatCurrency(amount)}</p>
                <p className="text-muted-foreground">
                  Aguarde a confirmação...
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Result Screen */}
        {screen === 'result' && lastResult && (
          <div className="flex-1 flex items-center justify-center">
            <POSTransactionResult
              transaction={lastResult}
              onNewTransaction={handleNewTransaction}
            />
          </div>
        )}
      </main>

      {/* History Sheet */}
      <POSHistory
        open={showHistory}
        onClose={() => setShowHistory(false)}
        transactions={transactions}
      />
    </div>
  );
}
