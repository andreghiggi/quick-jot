import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ARStatus = 'open' | 'paid' | 'canceled';

export interface AccountReceivable {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_document: string | null;
  amount: number;
  balance: number;
  issue_date: string;   // YYYY-MM-DD
  due_date: string;     // YYYY-MM-DD
  status: ARStatus;
  origin: string;
  pdv_sale_id: string | null;
  notes: string | null;
  paid_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountReceivablePayment {
  id: string;
  receivable_id: string;
  company_id: string;
  amount: number;
  paid_at: string;
  payment_method_id: string | null;
  payment_name: string;
  operator_id: string | null;
  notes: string | null;
  created_at: string;
}

interface CreateReceivableInput {
  companyId: string;
  customerName: string;
  customerPhone?: string | null;
  customerDocument?: string | null;
  customerId?: string | null;
  amount: number;
  pdvSaleId?: string | null;
  dueDate?: string; // YYYY-MM-DD, default hoje
  notes?: string | null;
  createdBy?: string | null;
}

interface ReceivePaymentInput {
  receivableId: string;
  companyId: string;
  amount: number;
  paymentName: string;
  paymentMethodId?: string | null;
  operatorId?: string | null;
  notes?: string | null;
}

/**
 * Hook do módulo Financeiro — Contas a Receber (Fase 1: Crediário).
 *
 * Isolado: consome apenas as tabelas `accounts_receivable` e
 * `accounts_receivable_payments`. Não altera pdv_sales, orders,
 * cash_registers nem qualquer outro fluxo já existente.
 */
export function useAccountsReceivable(companyId?: string | null) {
  const [items, setItems] = useState<AccountReceivable[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('accounts_receivable' as any)
      .select('*')
      .eq('company_id', companyId)
      .order('due_date', { ascending: true });
    if (error) {
      console.error('[useAccountsReceivable] load error', error);
      setLoading(false);
      return;
    }
    setItems((data as any[]) as AccountReceivable[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(async (input: CreateReceivableInput): Promise<string | null> => {
    const payload: any = {
      company_id: input.companyId,
      customer_id: input.customerId ?? null,
      customer_name: input.customerName,
      customer_phone: input.customerPhone ?? null,
      customer_document: input.customerDocument ?? null,
      amount: input.amount,
      balance: input.amount,
      due_date: input.dueDate ?? undefined,
      pdv_sale_id: input.pdvSaleId ?? null,
      notes: input.notes ?? null,
      origin: 'frente_caixa',
      created_by: input.createdBy ?? null,
    };
    const { data, error } = await supabase
      .from('accounts_receivable' as any)
      .insert(payload)
      .select('id')
      .single();
    if (error) {
      console.error('[useAccountsReceivable] create error', error);
      toast.error('Falha ao criar título de crediário: ' + (error.message || ''));
      return null;
    }
    await load();
    return (data as any).id as string;
  }, [load]);

  const receivePayment = useCallback(async (input: ReceivePaymentInput): Promise<boolean> => {
    // 1) carrega saldo atual
    const { data: cur, error: e1 } = await supabase
      .from('accounts_receivable' as any)
      .select('id, balance, amount, status')
      .eq('id', input.receivableId)
      .maybeSingle();
    if (e1 || !cur) {
      toast.error('Título não encontrado.');
      return false;
    }
    const row = cur as any;
    if (row.status !== 'open') {
      toast.error('Título já está ' + (row.status === 'paid' ? 'quitado' : 'cancelado') + '.');
      return false;
    }
    const amt = Math.max(0, Math.min(input.amount, Number(row.balance)));
    if (amt <= 0) {
      toast.error('Valor de recebimento inválido.');
      return false;
    }

    // 2) insere recebimento
    const { error: e2 } = await supabase
      .from('accounts_receivable_payments' as any)
      .insert({
        receivable_id: input.receivableId,
        company_id: input.companyId,
        amount: amt,
        payment_method_id: input.paymentMethodId ?? null,
        payment_name: input.paymentName,
        operator_id: input.operatorId ?? null,
        notes: input.notes ?? null,
      });
    if (e2) {
      console.error('[useAccountsReceivable] receive error', e2);
      toast.error('Falha ao registrar recebimento: ' + (e2.message || ''));
      return false;
    }

    // 3) atualiza saldo/status
    const newBalance = Math.max(0, Number(row.balance) - amt);
    const isPaid = newBalance <= 0.005;
    const { error: e3 } = await supabase
      .from('accounts_receivable' as any)
      .update({
        balance: newBalance,
        status: isPaid ? 'paid' : 'open',
        paid_at: isPaid ? new Date().toISOString() : null,
      })
      .eq('id', input.receivableId);
    if (e3) {
      console.error('[useAccountsReceivable] update balance error', e3);
      toast.error('Recebimento salvo, mas falha ao atualizar saldo.');
      await load();
      return false;
    }

    await load();
    toast.success(isPaid ? 'Título quitado.' : 'Recebimento registrado.');
    return true;
  }, [load]);

  const cancel = useCallback(async (
    receivableId: string,
    reason?: string,
    canceledBy?: string,
  ): Promise<boolean> => {
    const { error } = await supabase
      .from('accounts_receivable' as any)
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        canceled_by: canceledBy ?? null,
        cancel_reason: reason ?? null,
      })
      .eq('id', receivableId);
    if (error) {
      console.error('[useAccountsReceivable] cancel error', error);
      toast.error('Falha ao cancelar título: ' + (error.message || ''));
      return false;
    }
    await load();
    toast.success('Título cancelado.');
    return true;
  }, [load]);

  const listPayments = useCallback(async (receivableId: string): Promise<AccountReceivablePayment[]> => {
    const { data, error } = await supabase
      .from('accounts_receivable_payments' as any)
      .select('*')
      .eq('receivable_id', receivableId)
      .order('paid_at', { ascending: false });
    if (error) {
      console.error('[useAccountsReceivable] listPayments error', error);
      return [];
    }
    return (data as any[]) as AccountReceivablePayment[];
  }, []);

  return { items, loading, reload: load, create, receivePayment, cancel, listPayments };
}