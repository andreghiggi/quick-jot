import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Order } from '@/types/order';

function startOfTodaySP(): string {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Date(`${day}T00:00:00-03:00`).toISOString();
}

/**
 * Faturamento do dia (perfil floricultura):
 *  - todas as vendas cobradas hoje (Frente de Caixa / PDV / cobrança de pedido), não canceladas;
 *  - + pedidos recebidos hoje já pagos/entregues que não têm venda vinculada.
 * Atualiza a cada 60s (sem tempo real para não gerar excesso de consultas).
 */
export function useFloristRevenueToday(companyId: string | undefined, enabled: boolean, todayOrders: Order[]) {
  const [sales, setSales] = useState<{ total: number; orderIds: Set<string> }>({ total: 0, orderIds: new Set() });

  const load = useCallback(async () => {
    if (!enabled || !companyId) return;
    const { data, error } = await supabase
      .from('pdv_sales')
      .select('final_total, notes, order_id')
      .eq('company_id', companyId)
      .gte('created_at', startOfTodaySP());
    if (error) { console.error('[useFloristRevenueToday]', error); return; }
    const valid = (data || []).filter((s: any) => !String(s.notes || '').includes('[CANCELADA]'));
    setSales({
      total: valid.reduce((acc: number, s: any) => acc + (Number(s.final_total) || 0), 0),
      orderIds: new Set(valid.map((s: any) => s.order_id).filter(Boolean)),
    });
  }, [companyId, enabled]);

  useEffect(() => {
    load();
    if (!enabled) return;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load, enabled]);

  const ordersRevenue = todayOrders
    .filter((o) => o.status !== 'canceled' && !o.notes?.includes('[CANCELADA]'))
    .filter((o) => o.status === 'delivered' || (o as any).paymentStatus === 'paid')
    .filter((o) => !sales.orderIds.has(o.id))
    .reduce((acc, o) => acc + o.total, 0);

  return sales.total + ordersRevenue;
}
