import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { rollbackApprovedTef } from '@/utils/pdvV2MultiPayment';
import type { NFCeTefData } from '@/services/nfceService';

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
  document_number: string | null;
  interest_amount: number;
  fine_amount: number;
  tags: string[];
  origin_type: string | null;
  origin_id: string | null;
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
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  tef_control_number?: string | null;
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
  issueDate?: string; // YYYY-MM-DD, default hoje
  documentNumber?: string | null;
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
      issue_date: input.issueDate ?? undefined,
      document_number: input.documentNumber ?? undefined,
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

  const remove = useCallback(async (receivableId: string): Promise<boolean> => {
    const { error } = await supabase.from('accounts_receivable' as any).delete().eq('id', receivableId);
    if (error) { toast.error('Falha ao excluir: ' + error.message); return false; }
    await load();
    toast.success('Título excluído.');
    return true;
  }, [load]);

  const update = useCallback(async (id: string, patch: Partial<AccountReceivable>): Promise<boolean> => {
    const { error } = await supabase.from('accounts_receivable' as any).update(patch as any).eq('id', id);
    if (error) { toast.error('Falha ao atualizar: ' + error.message); return false; }
    await load();
    return true;
  }, [load]);

  const renegotiate = useCallback(async (
    id: string, newAmount: number, newDueDate: string, reason: string, companyId: string, userId?: string | null,
  ): Promise<boolean> => {
    const { data: cur } = await supabase.from('accounts_receivable' as any).select('amount, balance, due_date').eq('id', id).maybeSingle();
    const row = cur as any;
    if (!row) { toast.error('Título não encontrado.'); return false; }
    const { error: ehist } = await supabase.from('accounts_renegotiations' as any).insert({
      company_id: companyId, account_type: 'receivable', account_id: id,
      old_amount: row.amount, new_amount: newAmount,
      old_due_date: row.due_date, new_due_date: newDueDate,
      reason: reason || null, created_by: userId ?? null,
    });
    if (ehist) { toast.error('Falha ao registrar renegociação: ' + ehist.message); return false; }
    const alreadyPaid = Number(row.amount) - Number(row.balance);
    const newBalance = Math.max(0, newAmount - alreadyPaid);
    const { error } = await supabase.from('accounts_receivable' as any).update({
      amount: newAmount, balance: newBalance, due_date: newDueDate,
    }).eq('id', id);
    if (error) { toast.error('Falha ao renegociar: ' + error.message); return false; }
    await load();
    toast.success('Título renegociado.');
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

  /**
   * Efetiva um recebimento com múltiplas formas de pagamento (split).
   * Cada linha vira 1 registro em `accounts_receivable_payments`. Aplica
   * juros/multa (somam ao total efetivamente pago) e desconto/acréscimo
   * (ajuste no cabeçalho para bater com o total do split).
   */
  const receivePaymentSplit = useCallback(async (input: {
    receivableId: string;
    companyId: string;
    operatorId?: string | null;
    interest?: number;   // juros
    fine?: number;       // multa
    discount?: number;   // desconto
    surcharge?: number;  // acréscimo
    payments: Array<{
      amount: number;
      paymentMethodId?: string | null;
      paymentName: string;
      /** Fragmento de notas por pagamento (ex.: "TEF PinPad: NSU X | Aut Y | ...").
       *  Persistido em accounts_receivable_payments.notes para o Relatório TEF. */
      notes?: string | null;
      /** Integração TEF (quando aprovada) — usada para rollback automático. */
      integration?: 'tef_pinpad' | 'tef_smartpos';
      /** Dados TEF já aprovados (NSU/aut/bandeira) — usados para rollback. */
      tef?: NFCeTefData;
    }>;
  }): Promise<boolean> => {
    if (!input.payments.length) { toast.error('Adicione ao menos uma forma de pagamento.'); return false; }

    const { data: cur, error: e1 } = await supabase
      .from('accounts_receivable' as any)
      .select('id, balance, amount, status, interest_amount, fine_amount')
      .eq('id', input.receivableId)
      .maybeSingle();
    if (e1 || !cur) { toast.error('Título não encontrado.'); return false; }
    const row = cur as any;
    if (row.status !== 'open') {
      toast.error('Título já está ' + (row.status === 'paid' ? 'quitado' : 'cancelado') + '.');
      return false;
    }

    const paidTotal = input.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    if (paidTotal <= 0) { toast.error('Valor total inválido.'); return false; }

    // Extrai número de controle TEF (023-000) do fragmento de notes para
    // habilitar estorno automático via PinPad depois.
    const extractControl = (n?: string | null) => {
      if (!n) return null;
      const m = n.match(/\[TEF023\]([^\[]+)\[\/TEF023\]/);
      return m ? m[1].trim() : null;
    };

    // Inserir cada pagamento individual
    const rows = input.payments.map((p) => ({
      receivable_id: input.receivableId,
      company_id: input.companyId,
      amount: p.amount,
      payment_method_id: p.paymentMethodId ?? null,
      payment_name: p.paymentName,
      operator_id: input.operatorId ?? null,
      notes: p.notes ?? null,
      tef_control_number: extractControl(p.notes),
    }));
    const { error: e2 } = await supabase.from('accounts_receivable_payments' as any).insert(rows);
    if (e2) {
      // ROLLBACK TEF: qualquer linha TEF já aprovada precisa ser estornada
      // no PinPad — caso contrário o cliente foi cobrado sem o título ser
      // baixado no sistema.
      let rolled = 0;
      for (const p of input.payments) {
        if (p.integration && p.tef) {
          const ok = await rollbackApprovedTef(input.companyId, {
            payment_method_id: p.paymentMethodId || '',
            payment_name: p.paymentName,
            amount: p.amount,
            integration: p.integration,
            tef: p.tef,
            tef_control_number: extractControl(p.notes) || undefined,
          } as any);
          if (ok) rolled++;
        }
      }
      toast.error(
        'Falha ao registrar recebimento: ' + e2.message +
        (rolled ? ` — ${rolled} cobrança(s) TEF estornada(s) automaticamente.` : ''),
      );
      return false;
    }

    // Ajusta saldo: soma juros/multa/acréscimo ao valor devido e subtrai
    // desconto antes de comparar com o total efetivamente recebido.
    const currentBalance = Number(row.balance);
    const adjustments =
      Number(input.interest || 0) +
      Number(input.fine || 0) +
      Number(input.surcharge || 0) -
      Number(input.discount || 0);
    const newBalance = Math.max(0, +(currentBalance + adjustments - paidTotal).toFixed(2));
    const isPaid = newBalance <= 0.005;

    const { error: e3 } = await supabase.from('accounts_receivable' as any).update({
      balance: newBalance,
      status: isPaid ? 'paid' : 'open',
      interest_amount: Number(row.interest_amount || 0) + Number(input.interest || 0),
      fine_amount: Number(row.fine_amount || 0) + Number(input.fine || 0),
      paid_at: isPaid ? new Date().toISOString() : null,
    }).eq('id', input.receivableId);
    if (e3) { toast.error('Recebimento salvo, mas falha ao atualizar saldo.'); await load(); return false; }

    await load();
    toast.success(isPaid ? 'Título quitado.' : 'Recebimento registrado.');
    return true;
  }, [load]);

  /**
   * Estorna um recebimento já lançado:
   *  - Se a linha era TEF (tem tef_control_number + notes com NSU/rede),
   *    tenta cancelar no PinPad via CNC (mesmo helper do PDV V2).
   *  - Marca `reversed_at/by/reason` no `accounts_receivable_payments`.
   *  - Devolve o valor ao saldo do título (reabre se estava quitado).
   *  - Registra evento em `accounts_renegotiations` para trilha de auditoria.
   */
  const reversePayment = useCallback(async (input: {
    paymentId: string;
    companyId: string;
    reason: string;
    userId?: string | null;
  }): Promise<boolean> => {
    if (!input.reason?.trim()) {
      toast.error('Informe o motivo do estorno.');
      return false;
    }
    const { data: p, error: ep } = await supabase
      .from('accounts_receivable_payments' as any)
      .select('*')
      .eq('id', input.paymentId)
      .maybeSingle();
    if (ep || !p) { toast.error('Recebimento não encontrado.'); return false; }
    const pay = p as any;
    if (pay.reversed_at) { toast.error('Este recebimento já foi estornado.'); return false; }

    // Tenta CNC no PinPad quando havia TEF aprovado.
    let tefReversed: boolean | null = null;
    if (pay.tef_control_number && pay.notes) {
      const nsu = (pay.notes.match(/NSU\s*[:=]?\s*(\d+)/i)?.[1]) || '';
      const rede = (pay.notes.match(/(?:Rede|Bandeira|Adq(?:uirente)?)\s*[:=]?\s*([A-Za-z0-9]+)/i)?.[1]) || '';
      if (nsu && rede) {
        const line: any = {
          payment_method_id: pay.payment_method_id || '',
          payment_name: pay.payment_name,
          amount: Number(pay.amount) || 0,
          integration: 'tef_pinpad' as const,
          tef: { nsu, adquirente: rede } as unknown as NFCeTefData,
          tef_control_number: pay.tef_control_number,
        };
        tefReversed = await rollbackApprovedTef(input.companyId, line);
        if (!tefReversed) {
          toast.error('Falha ao estornar TEF no PinPad. Cancele manualmente antes de confirmar.');
          return false;
        }
      }
    }

    // Marca o pagamento como estornado.
    const { error: eupd } = await supabase
      .from('accounts_receivable_payments' as any)
      .update({
        reversed_at: new Date().toISOString(),
        reversed_by: input.userId ?? null,
        reversal_reason: input.reason.trim(),
      })
      .eq('id', input.paymentId);
    if (eupd) { toast.error('Falha ao registrar estorno: ' + eupd.message); return false; }

    // Devolve saldo ao título e reabre se necessário.
    const { data: r } = await supabase
      .from('accounts_receivable' as any)
      .select('id, balance, amount, status')
      .eq('id', pay.receivable_id)
      .maybeSingle();
    if (r) {
      const row = r as any;
      const newBalance = +(Number(row.balance) + Number(pay.amount)).toFixed(2);
      const cappedBalance = Math.min(newBalance, Number(row.amount));
      await supabase.from('accounts_receivable' as any).update({
        balance: cappedBalance,
        status: cappedBalance > 0.005 ? 'open' : row.status,
        paid_at: cappedBalance > 0.005 ? null : row.paid_at,
      }).eq('id', pay.receivable_id);
    }

    // Trilha de auditoria.
    await supabase.from('accounts_renegotiations' as any).insert({
      company_id: input.companyId,
      account_type: 'receivable',
      account_id: pay.receivable_id,
      old_amount: pay.amount,
      new_amount: 0,
      old_due_date: null,
      new_due_date: null,
      reason: `Estorno de recebimento (${pay.payment_name} R$ ${Number(pay.amount).toFixed(2)}): ${input.reason.trim()}${tefReversed === true ? ' [TEF estornado no PinPad]' : ''}`,
      created_by: input.userId ?? null,
    });

    await load();
    toast.success(
      tefReversed === true
        ? 'Recebimento estornado (TEF cancelado no PinPad).'
        : 'Recebimento estornado.',
    );
    return true;
  }, [load]);

  /**
   * Renegocia um título gerando N novas parcelas: cancela o original
   * (`status='canceled'` + histórico em `accounts_renegotiations`) e
   * cria N novas contas a receber com o valor/intervalo informados.
   */
  const renegotiateSplit = useCallback(async (input: {
    receivableId: string;
    companyId: string;
    userId?: string | null;
    newTotalAmount: number;
    installments: Array<{ amount: number; dueDate: string }>;
    reason?: string | null;
  }): Promise<boolean> => {
    const { data: cur } = await supabase
      .from('accounts_receivable' as any)
      .select('*')
      .eq('id', input.receivableId)
      .maybeSingle();
    const row = cur as any;
    if (!row) { toast.error('Título não encontrado.'); return false; }

    // 1) Histórico da renegociação
    const firstDue = input.installments[0]?.dueDate || row.due_date;
    const { error: ehist } = await supabase.from('accounts_renegotiations' as any).insert({
      company_id: input.companyId,
      account_type: 'receivable',
      account_id: input.receivableId,
      old_amount: row.amount,
      new_amount: input.newTotalAmount,
      old_due_date: row.due_date,
      new_due_date: firstDue,
      reason: input.reason || null,
      created_by: input.userId ?? null,
    });
    if (ehist) { toast.error('Falha ao registrar renegociação: ' + ehist.message); return false; }

    // 2) Cancela o original
    const { error: ecancel } = await supabase.from('accounts_receivable' as any).update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      canceled_by: input.userId ?? null,
      cancel_reason: `Renegociado em ${input.installments.length}x`,
    }).eq('id', input.receivableId);
    if (ecancel) { toast.error('Falha ao cancelar original: ' + ecancel.message); return false; }

    // 3) Cria as novas parcelas
    const n = input.installments.length;
    const docBase = row.document_number
      ? String(row.document_number).replace(/-\d+\/\d+$/, '') + '-R'
      : `REN${String(input.receivableId).slice(0, 6).toUpperCase()}`;
    const newRows = input.installments.map((it, i) => ({
      company_id: input.companyId,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      customer_document: row.customer_document,
      amount: it.amount,
      balance: it.amount,
      due_date: it.dueDate,
      issue_date: new Date().toISOString().slice(0, 10),
      document_number: n > 1 ? `${docBase}-${i + 1}/${n}` : docBase,
      pdv_sale_id: row.pdv_sale_id,
      notes: `Renegociação do título ${row.document_number || row.id.slice(0, 6)}`,
      origin: 'renegociacao',
      created_by: input.userId ?? null,
    }));
    const { error: enew } = await supabase.from('accounts_receivable' as any).insert(newRows);
    if (enew) { toast.error('Falha ao criar novas parcelas: ' + enew.message); return false; }

    await load();
    toast.success(`Título renegociado em ${n} parcela(s).`);
    return true;
  }, [load]);

  /**
   * Renegocia MÚLTIPLOS títulos em aberto (uma venda inteira) gerando N
   * novas parcelas: cancela cada título original + registra histórico e
   * cria as novas contas usando o primeiro como referência (mesmo cliente
   * e pdv_sale_id).
   */
  const renegotiateManySplit = useCallback(async (input: {
    receivableIds: string[];
    companyId: string;
    userId?: string | null;
    newTotalAmount: number;
    installments: Array<{ amount: number; dueDate: string }>;
    reason?: string | null;
  }): Promise<boolean> => {
    if (!input.receivableIds.length) { toast.error('Nenhuma parcela para renegociar.'); return false; }
    const { data: curs } = await supabase
      .from('accounts_receivable' as any)
      .select('*')
      .in('id', input.receivableIds);
    const rows = (curs as any[]) || [];
    if (!rows.length) { toast.error('Títulos não encontrados.'); return false; }
    const ref = rows[0];
    const firstDue = input.installments[0]?.dueDate || ref.due_date;

    // 1) Histórico por título
    const histRows = rows.map((r: any) => ({
      company_id: input.companyId,
      account_type: 'receivable',
      account_id: r.id,
      old_amount: r.amount,
      new_amount: input.newTotalAmount,
      old_due_date: r.due_date,
      new_due_date: firstDue,
      reason: input.reason || `Renegociação de venda em ${input.installments.length}x`,
      created_by: input.userId ?? null,
    }));
    const { error: ehist } = await supabase.from('accounts_renegotiations' as any).insert(histRows);
    if (ehist) { toast.error('Falha ao registrar renegociação: ' + ehist.message); return false; }

    // 2) Cancela todos os originais
    const { error: ecancel } = await supabase.from('accounts_receivable' as any).update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      canceled_by: input.userId ?? null,
      cancel_reason: `Renegociado em ${input.installments.length}x (venda)`,
    }).in('id', input.receivableIds);
    if (ecancel) { toast.error('Falha ao cancelar originais: ' + ecancel.message); return false; }

    // 3) Cria as novas parcelas
    const n = input.installments.length;
    const docBase = ref.document_number
      ? String(ref.document_number).replace(/-\d+\/\d+$/, '') + '-R'
      : `REN${String(ref.pdv_sale_id || ref.id).slice(0, 6).toUpperCase()}`;
    const newRows = input.installments.map((it, i) => ({
      company_id: input.companyId,
      customer_id: ref.customer_id,
      customer_name: ref.customer_name,
      customer_phone: ref.customer_phone,
      customer_document: ref.customer_document,
      amount: it.amount,
      balance: it.amount,
      due_date: it.dueDate,
      issue_date: new Date().toISOString().slice(0, 10),
      document_number: n > 1 ? `${docBase}-${i + 1}/${n}` : docBase,
      pdv_sale_id: ref.pdv_sale_id,
      notes: `Renegociação da venda ${ref.pdv_sale_id ? ref.pdv_sale_id.slice(0, 6) : ref.id.slice(0, 6)}`,
      origin: 'renegociacao',
      created_by: input.userId ?? null,
    }));
    const { error: enew } = await supabase.from('accounts_receivable' as any).insert(newRows);
    if (enew) { toast.error('Falha ao criar novas parcelas: ' + enew.message); return false; }

    await load();
    toast.success(`Venda renegociada em ${n} parcela(s).`);
    return true;
  }, [load]);

  return { items, loading, reload: load, create, receivePayment, receivePaymentSplit, reversePayment, cancel, remove, update, renegotiate, renegotiateSplit, renegotiateManySplit, listPayments };
}