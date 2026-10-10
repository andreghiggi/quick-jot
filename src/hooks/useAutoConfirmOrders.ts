import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Order } from '@/types/order';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useBusinessHours } from '@/hooks/useBusinessHours';
import { isAutoConfirmAllowedCompany, isAutoConfirmCandidate } from '@/utils/autoConfirmOrders';

/**
 * Confirmação automática de pedidos (piloto Lancheria da I9).
 * Depois que o recibo do pedido do cardápio é impresso (fila marcada como
 * impressa pelo auto_printer), confirma o pedido e envia o WhatsApp de
 * confirmação. Pedidos agendados (loja fechada com agendamento ativo)
 * continuam exigindo confirmação manual.
 */
export function useAutoConfirmOrders(params: {
  companyId?: string | null;
  orders: Order[];
  confirm: (orderId: string) => Promise<boolean>;
}) {
  const { companyId, orders, confirm } = params;
  const allowed = isAutoConfirmAllowedCompany(companyId);
  const { settings } = useStoreSettings({ companyId: allowed ? companyId : null });
  const { isCurrentlyOpen, loading: hoursLoading } = useBusinessHours({ companyId: allowed ? companyId : undefined });
  const attemptedRef = useRef<Set<string>>(new Set());
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const enabled = allowed && settings.autoConfirmOrders && !hoursLoading;

  const candidateIds = enabled
    ? orders
        .filter((o) => isAutoConfirmCandidate(o) && !attemptedRef.current.has(o.id))
        .map((o) => o.id)
    : [];
  const candidateKey = candidateIds.join(',');

  useEffect(() => {
    if (!enabled || candidateIds.length === 0) return;
    // Agendamento ativo e loja fechada: pedido é agendado → confirmação manual.
    if (settings.acceptOrderScheduling && !isCurrentlyOpen()) return;

    let cancelled = false;
    const check = async () => {
      const { data } = await supabase
        .from('print_queue')
        .select('id')
        .in('id', candidateIds)
        .eq('printed', true);
      if (cancelled || !data) return;
      for (const row of data as { id: string }[]) {
        if (attemptedRef.current.has(row.id)) continue;
        attemptedRef.current.add(row.id);
        await confirmRef.current(row.id);
      }
    };
    check();
    // Só consulta enquanto houver pedido aguardando impressão (piloto I9).
    const timer = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, candidateKey, settings.acceptOrderScheduling]);
}
