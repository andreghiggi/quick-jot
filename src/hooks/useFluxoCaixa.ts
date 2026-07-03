import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DailyFlow {
  date: string;              // YYYY-MM-DD
  entradas_realizadas: number;
  saidas_realizadas: number;
  entradas_previstas: number;
  saidas_previstas: number;
  saldo_dia: number;
  saldo_acumulado: number;
}

export interface FluxoTotals {
  entradas_realizadas: number;
  saidas_realizadas: number;
  entradas_previstas: number;
  saidas_previstas: number;
  saldo_realizado: number;
  saldo_projetado: number;
}

/**
 * Hook do módulo Financeiro — Fluxo de Caixa Consolidado (Fase 2).
 *
 * Apenas leitura. Agrega:
 *  - Entradas realizadas: pdv_sales (não canceladas) + accounts_receivable_payments
 *  - Entradas previstas: accounts_receivable com balance > 0 (open) vencendo no período
 *  - Saídas realizadas: accounts_payable_payments
 *  - Saídas previstas: accounts_payable com balance > 0 (open|partial) vencendo no período
 *
 * Datas em America/Sao_Paulo. `startDate` e `endDate` no formato YYYY-MM-DD (inclusivos).
 */
export function useFluxoCaixa(
  companyId: string | null | undefined,
  startDate: string,
  endDate: string,
) {
  const [daily, setDaily] = useState<DailyFlow[]>([]);
  const [totals, setTotals] = useState<FluxoTotals>({
    entradas_realizadas: 0,
    saidas_realizadas: 0,
    entradas_previstas: 0,
    saidas_previstas: 0,
    saldo_realizado: 0,
    saldo_projetado: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) {
      setDaily([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Janela em UTC para pegar todas as vendas do intervalo em BRT (-03).
    const startIso = `${startDate}T00:00:00-03:00`;
    const endIso = `${endDate}T23:59:59-03:00`;

    const [sales, arPayments, arOpen, apPayments, apOpen] = await Promise.all([
      supabase
        .from('pdv_sales')
        .select('pv_data_emissao, pv_total, pv_status')
        .eq('company_id', companyId)
        .gte('pv_data_emissao', startIso)
        .lte('pv_data_emissao', endIso)
        .neq('pv_status', 'canceled'),
      supabase
        .from('accounts_receivable_payments' as any)
        .select('paid_at, amount')
        .eq('company_id', companyId)
        .gte('paid_at', startIso)
        .lte('paid_at', endIso),
      supabase
        .from('accounts_receivable' as any)
        .select('due_date, balance, status')
        .eq('company_id', companyId)
        .eq('status', 'open')
        .gte('due_date', startDate)
        .lte('due_date', endDate),
      supabase
        .from('accounts_payable_payments' as any)
        .select('paid_at, amount')
        .eq('company_id', companyId)
        .gte('paid_at', startIso)
        .lte('paid_at', endIso),
      supabase
        .from('accounts_payable' as any)
        .select('due_date, balance, status')
        .eq('company_id', companyId)
        .in('status', ['open', 'partial'])
        .gte('due_date', startDate)
        .lte('due_date', endDate),
    ]);

    // Monta série diária
    const map = new Map<string, DailyFlow>();
    const initDay = (d: string): DailyFlow => ({
      date: d,
      entradas_realizadas: 0,
      saidas_realizadas: 0,
      entradas_previstas: 0,
      saidas_previstas: 0,
      saldo_dia: 0,
      saldo_acumulado: 0,
    });
    // popula dias vazios
    const cur = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    while (cur <= end) {
      const k = cur.toISOString().slice(0, 10);
      map.set(k, initDay(k));
      cur.setDate(cur.getDate() + 1);
    }

    const dateKeyFromTs = (iso: string) => {
      // converte para BRT (-03) para agrupar
      const d = new Date(iso);
      const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      return brt.toISOString().slice(0, 10);
    };

    for (const s of (sales.data ?? []) as any[]) {
      const k = dateKeyFromTs(s.pv_data_emissao);
      const row = map.get(k); if (!row) continue;
      row.entradas_realizadas += Number(s.pv_total || 0);
    }
    for (const p of (arPayments.data ?? []) as any[]) {
      const k = dateKeyFromTs(p.paid_at);
      const row = map.get(k); if (!row) continue;
      row.entradas_realizadas += Number(p.amount || 0);
    }
    for (const p of (apPayments.data ?? []) as any[]) {
      const k = dateKeyFromTs(p.paid_at);
      const row = map.get(k); if (!row) continue;
      row.saidas_realizadas += Number(p.amount || 0);
    }
    for (const r of (arOpen.data ?? []) as any[]) {
      const row = map.get(r.due_date); if (!row) continue;
      row.entradas_previstas += Number(r.balance || 0);
    }
    for (const r of (apOpen.data ?? []) as any[]) {
      const row = map.get(r.due_date); if (!row) continue;
      row.saidas_previstas += Number(r.balance || 0);
    }

    // Acumula saldo
    let acc = 0;
    const arr = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    for (const d of arr) {
      d.saldo_dia = d.entradas_realizadas - d.saidas_realizadas;
      acc += d.saldo_dia;
      d.saldo_acumulado = acc;
    }

    const totals: FluxoTotals = {
      entradas_realizadas: arr.reduce((s, d) => s + d.entradas_realizadas, 0),
      saidas_realizadas: arr.reduce((s, d) => s + d.saidas_realizadas, 0),
      entradas_previstas: arr.reduce((s, d) => s + d.entradas_previstas, 0),
      saidas_previstas: arr.reduce((s, d) => s + d.saidas_previstas, 0),
      saldo_realizado: 0,
      saldo_projetado: 0,
    };
    totals.saldo_realizado = totals.entradas_realizadas - totals.saidas_realizadas;
    totals.saldo_projetado = totals.saldo_realizado + totals.entradas_previstas - totals.saidas_previstas;

    setDaily(arr);
    setTotals(totals);
    setLoading(false);
  }, [companyId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  return { daily, totals, loading, reload: load };
}