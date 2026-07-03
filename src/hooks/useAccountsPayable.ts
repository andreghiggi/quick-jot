import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type APStatus = 'open' | 'partial' | 'paid' | 'canceled';

export interface AccountPayable {
  id: string;
  company_id: string;
  supplier_id: string | null;
  description: string;
  category: string | null;
  issue_date: string;
  due_date: string;
  amount: number;
  balance: number;
  status: APStatus;
  notes: string | null;
  paid_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  document_number: string | null;
  interest_amount: number;
  fine_amount: number;
  tags: string[];
  origin_type: string | null;
  origin_id: string | null;
}

export interface AccountPayablePayment {
  id: string;
  payable_id: string;
  company_id: string;
  amount: number;
  paid_at: string;
  payment_method: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

interface CreatePayableInput {
  companyId: string;
  description: string;
  amount: number;
  dueDate: string;      // YYYY-MM-DD
  issueDate?: string;   // default hoje
  category?: string | null;
  supplierId?: string | null;
  documentNumber?: string | null;
  supplierName?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

interface PayInput {
  payableId: string;
  companyId: string;
  amount: number;
  paymentMethod: string;
  notes?: string | null;
  createdBy?: string | null;
}

/**
 * Hook do módulo Financeiro — Contas a Pagar (Fase 2).
 * Isolado: consome apenas `accounts_payable` e `accounts_payable_payments`.
 * Não altera nenhum fluxo existente.
 */
export function useAccountsPayable(companyId?: string | null) {
  const [items, setItems] = useState<AccountPayable[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('accounts_payable' as any)
      .select('*')
      .eq('company_id', companyId)
      .order('due_date', { ascending: true });
    if (error) {
      console.error('[useAccountsPayable] load error', error);
      setLoading(false);
      return;
    }
    setItems((data as any[]) as AccountPayable[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: CreatePayableInput): Promise<string | null> => {
    const payload: any = {
      company_id: input.companyId,
      supplier_id: input.supplierId ?? null,
      description: input.description,
      category: input.category ?? null,
      amount: input.amount,
      balance: input.amount,
      due_date: input.dueDate,
      issue_date: input.issueDate ?? undefined,
      document_number: input.documentNumber ?? undefined,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    };
    const { data, error } = await supabase
      .from('accounts_payable' as any)
      .insert(payload)
      .select('id')
      .single();
    if (error) {
      console.error('[useAccountsPayable] create error', error);
      toast.error('Falha ao criar conta a pagar: ' + (error.message || ''));
      return null;
    }
    await load();
    toast.success('Conta a pagar criada.');
    return (data as any).id as string;
  }, [load]);

  const pay = useCallback(async (input: PayInput): Promise<boolean> => {
    const { data: cur, error: e1 } = await supabase
      .from('accounts_payable' as any)
      .select('id, balance, amount, status')
      .eq('id', input.payableId)
      .maybeSingle();
    if (e1 || !cur) {
      toast.error('Título não encontrado.');
      return false;
    }
    const row = cur as any;
    if (row.status === 'paid' || row.status === 'canceled') {
      toast.error('Título já está ' + (row.status === 'paid' ? 'quitado' : 'cancelado') + '.');
      return false;
    }
    const amt = Math.max(0, Math.min(input.amount, Number(row.balance)));
    if (amt <= 0) {
      toast.error('Valor de pagamento inválido.');
      return false;
    }

    const { error: e2 } = await supabase
      .from('accounts_payable_payments' as any)
      .insert({
        payable_id: input.payableId,
        company_id: input.companyId,
        amount: amt,
        payment_method: input.paymentMethod,
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
      });
    if (e2) {
      console.error('[useAccountsPayable] pay error', e2);
      toast.error('Falha ao registrar pagamento: ' + (e2.message || ''));
      return false;
    }

    const newBalance = Math.max(0, Number(row.balance) - amt);
    const isPaid = newBalance <= 0.005;
    const newStatus: APStatus = isPaid ? 'paid' : 'partial';
    const { error: e3 } = await supabase
      .from('accounts_payable' as any)
      .update({
        balance: newBalance,
        status: newStatus,
        paid_at: isPaid ? new Date().toISOString() : null,
      })
      .eq('id', input.payableId);
    if (e3) {
      console.error('[useAccountsPayable] update balance error', e3);
      toast.error('Pagamento salvo, mas falha ao atualizar saldo.');
      await load();
      return false;
    }
    await load();
    toast.success(isPaid ? 'Título quitado.' : 'Pagamento registrado.');
    return true;
  }, [load]);

  const cancel = useCallback(async (
    payableId: string,
    reason?: string,
    canceledBy?: string,
  ): Promise<boolean> => {
    const { error } = await supabase
      .from('accounts_payable' as any)
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        canceled_by: canceledBy ?? null,
        cancel_reason: reason ?? null,
      })
      .eq('id', payableId);
    if (error) {
      console.error('[useAccountsPayable] cancel error', error);
      toast.error('Falha ao cancelar título: ' + (error.message || ''));
      return false;
    }
    await load();
    toast.success('Título cancelado.');
    return true;
  }, [load]);

  const remove = useCallback(async (payableId: string): Promise<boolean> => {
    const { error } = await supabase.from('accounts_payable' as any).delete().eq('id', payableId);
    if (error) { toast.error('Falha ao excluir: ' + error.message); return false; }
    await load();
    toast.success('Título excluído.');
    return true;
  }, [load]);

  const update = useCallback(async (id: string, patch: Partial<AccountPayable>): Promise<boolean> => {
    const { error } = await supabase.from('accounts_payable' as any).update(patch as any).eq('id', id);
    if (error) { toast.error('Falha ao atualizar: ' + error.message); return false; }
    await load();
    return true;
  }, [load]);

  const renegotiate = useCallback(async (
    id: string, newAmount: number, newDueDate: string, reason: string, companyId: string, userId?: string | null,
  ): Promise<boolean> => {
    const { data: cur } = await supabase.from('accounts_payable' as any).select('amount, balance, due_date').eq('id', id).maybeSingle();
    const row = cur as any;
    if (!row) { toast.error('Título não encontrado.'); return false; }
    const { error: ehist } = await supabase.from('accounts_renegotiations' as any).insert({
      company_id: companyId, account_type: 'payable', account_id: id,
      old_amount: row.amount, new_amount: newAmount,
      old_due_date: row.due_date, new_due_date: newDueDate,
      reason: reason || null, created_by: userId ?? null,
    });
    if (ehist) { toast.error('Falha ao registrar renegociação: ' + ehist.message); return false; }
    const alreadyPaid = Number(row.amount) - Number(row.balance);
    const newBalance = Math.max(0, newAmount - alreadyPaid);
    const { error } = await supabase.from('accounts_payable' as any).update({
      amount: newAmount, balance: newBalance, due_date: newDueDate,
    }).eq('id', id);
    if (error) { toast.error('Falha ao renegociar: ' + error.message); return false; }
    await load();
    toast.success('Título renegociado.');
    return true;
  }, [load]);

  const listPayments = useCallback(async (payableId: string): Promise<AccountPayablePayment[]> => {
    const { data, error } = await supabase
      .from('accounts_payable_payments' as any)
      .select('*')
      .eq('payable_id', payableId)
      .order('paid_at', { ascending: false });
    if (error) {
      console.error('[useAccountsPayable] listPayments error', error);
      return [];
    }
    return (data as any[]) as AccountPayablePayment[];
  }, []);

  return { items, loading, reload: load, create, pay, cancel, remove, update, renegotiate, listPayments };
}