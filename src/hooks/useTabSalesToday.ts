import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Soma das vendas de Comandas/Mesas do dia (pdv_sales sem pedido vinculado,
 * notas com "Comanda", excluindo canceladas). Recarrega ao abrir a tela e
 * quando a janela volta ao foco — sem polling contínuo.
 */
export function useTabSalesToday(companyId?: string | null) {
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!companyId) { setTotal(0); return; }
    const now = new Date();
    const spNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const offsetMs = spNow.getTime() - now.getTime();
    spNow.setHours(0, 0, 0, 0);
    const startISO = new Date(spNow.getTime() - offsetMs).toISOString();
    const { data, error } = await supabase
      .from('pdv_sales')
      .select('final_total, notes')
      .eq('company_id', companyId)
      .is('order_id', null)
      .ilike('notes', '%comanda%')
      .gte('created_at', startISO);
    if (error) { console.error('[useTabSalesToday]', error); return; }
    const sum = (data || [])
      .filter((s: any) => !String(s.notes || '').includes('[CANCELADA]'))
      .reduce((acc: number, s: any) => acc + (Number(s.final_total) || 0), 0);
    setTotal(sum);
  }, [companyId]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  return total;
}
