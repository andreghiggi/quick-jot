import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const FAST_SALE_EVENT = 'pdv:fast-sale-completed';

/** Início do dia atual em America/Sao_Paulo (UTC-3) como ISO. */
function startOfTodaySP(): string {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Date(`${day}T00:00:00-03:00`).toISOString();
}

/**
 * Soma das Vendas Rápidas do dia (pdv_sales sem pedido vinculado, marcadas
 * "[VENDA RÁPIDA]", não canceladas). Não se sobrepõe a pedidos entregues
 * porque essas vendas nunca possuem order_id.
 */
export function useFastSalesToday(companyId?: string | null) {
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    // Venda Rápida é exclusiva da Amore Mio: demais lojas não consultam.
    if (!companyId || companyId !== AMORE_MIO_ID) { setTotal(0); return; }
    const { data, error } = await supabase
      .from('pdv_sales')
      .select('final_total, notes')
      .eq('company_id', companyId)
      .is('order_id', null)
      .ilike('notes', '%[VENDA RÁPIDA]%')
      .gte('created_at', startOfTodaySP());
    if (error) { console.error('[useFastSalesToday]', error); return; }
    const sum = (data || [])
      .filter((s: any) => !String(s.notes || '').includes('[CANCELADA]'))
      .reduce((acc: number, s: any) => acc + (Number(s.final_total) || 0), 0);
    setTotal(sum);
  }, [companyId]);

  useEffect(() => {
    load();
    const onSale = () => load();
    window.addEventListener(FAST_SALE_EVENT, onSale);
    const iv = window.setInterval(load, 60000);
    return () => { window.removeEventListener(FAST_SALE_EVENT, onSale); window.clearInterval(iv); };
  }, [load]);

  return total;
}
