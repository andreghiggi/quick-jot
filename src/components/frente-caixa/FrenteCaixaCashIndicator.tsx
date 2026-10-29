import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getExpectedCashDrawer, loadCashClosingSales } from '@/utils/cashClosingSales';
import { formatPrice } from '@/lib/utils';

interface Props {
  companyId?: string;
  register: { id: string; opening_amount?: number | null; opened_at?: string | null; closed_at?: string | null } | null | undefined;
  cashOpenKnown: boolean | null | undefined;
  /** Muda a cada venda concluída para recalcular o valor. */
  refreshKey?: unknown;
}

/** "Caixa Aberto / Em caixa: R$ ••••" — mesmo indicador do PDV V2 (perfil floricultura). */
export function FrenteCaixaCashIndicator({ companyId, register, cashOpenKnown, refreshKey }: Props) {
  const [show, setShow] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    if (!companyId || !register?.id) { setMovements([]); setSales([]); return; }
    (async () => {
      try {
        const [{ data }, mapped] = await Promise.all([
          supabase.from('cash_movements').select('type, amount').eq('cash_register_id', register.id),
          loadCashClosingSales({
            companyId,
            registerId: register.id,
            openedAt: register.opened_at ?? null,
            closedAt: register.closed_at ?? null,
          }),
        ]);
        if (!active) return;
        setMovements(data || []);
        setSales(mapped as any[]);
      } catch (e) {
        console.error('[FrenteCaixaCashIndicator]', e);
      }
    })();
    return () => { active = false; };
  }, [companyId, register?.id, register?.opened_at, register?.closed_at, refreshKey]);

  const amount = useMemo(
    () => getExpectedCashDrawer(Number(register?.opening_amount || 0), sales as any, movements as any),
    [register?.opening_amount, sales, movements],
  );

  if (cashOpenKnown == null && !register) return null;
  const open = !!register;

  return (
    <div className="flex items-center gap-3 ml-2">
      <Badge
        className={
          open
            ? 'bg-success hover:bg-success text-success-foreground font-bold border-transparent'
            : 'bg-destructive hover:bg-destructive text-destructive-foreground font-bold border-transparent'
        }
      >
        Caixa {open ? 'Aberto' : 'Fechado'}
      </Badge>
      {open && (
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">Em caixa:</span>
          <span className="font-semibold tabular-nums">{show ? formatPrice(amount) : 'R$ ••••'}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShow((s) => !s)} title={show ? 'Ocultar valor' : 'Mostrar valor'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
