// Sync service for POS transactions with backend

import { supabase } from '@/integrations/supabase/client';
import { POSTransaction } from '@/types/pos';
import { 
  getPendingSyncTransactions, 
  markTransactionSynced,
  saveTransaction 
} from './posStorage';

let syncInterval: ReturnType<typeof setInterval> | null = null;
let isOnline = navigator.onLine;

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    console.log('[POS Sync] Online - starting sync');
    syncPendingTransactions();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    console.log('[POS Sync] Offline - sync paused');
  });
}

export function startSyncService(intervalMs = 30000): void {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(() => {
    if (isOnline) {
      syncPendingTransactions();
    }
  }, intervalMs);

  // Initial sync
  if (isOnline) {
    syncPendingTransactions();
  }

  console.log('[POS Sync] Service started');
}

export function stopSyncService(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  console.log('[POS Sync] Service stopped');
}

export async function syncPendingTransactions(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingSyncTransactions();
  
  if (pending.length === 0) {
    return { synced: 0, failed: 0 };
  }

  console.log(`[POS Sync] Syncing ${pending.length} transactions...`);

  let synced = 0;
  let failed = 0;

  for (const transaction of pending) {
    try {
      const result = await syncTransaction(transaction);
      if (result) {
        synced++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error('[POS Sync] Error syncing transaction:', error);
      failed++;
    }
  }

  console.log(`[POS Sync] Complete: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

async function syncTransaction(transaction: POSTransaction): Promise<boolean> {
  // First, create a PDV sale record if there's an open cash register
  const { data: cashRegister, error: registerError } = await supabase
    .from('cash_registers')
    .select('id')
    .eq('company_id', transaction.companyId)
    .eq('status', 'open')
    .single();

  if (registerError || !cashRegister) {
    console.warn('[POS Sync] No open cash register found, transaction will be synced later');
    return false;
  }

  // Get a payment method ID
  const { data: paymentMethod } = await supabase
    .from('payment_methods')
    .select('id')
    .eq('company_id', transaction.companyId)
    .eq('active', true)
    .limit(1)
    .single();

  // Create the sale record
  const { data: sale, error: saleError } = await supabase
    .from('pdv_sales')
    .insert({
      company_id: transaction.companyId,
      cash_register_id: cashRegister.id,
      payment_method_id: paymentMethod?.id || null,
      total: transaction.amount,
      discount: 0,
      final_total: transaction.amount,
      customer_name: transaction.customerName || 'POS',
      notes: `POS Transaction - NSU: ${transaction.nsu || 'N/A'} - Auth: ${transaction.authorizationCode || 'N/A'}`,
      created_by: transaction.operatorId,
    })
    .select()
    .single();

  if (saleError) {
    console.error('[POS Sync] Error creating sale:', saleError);
    return false;
  }

  // Mark as synced
  await markTransactionSynced(transaction.localId, sale.id);
  
  return true;
}

export function isOnlineStatus(): boolean {
  return isOnline;
}
