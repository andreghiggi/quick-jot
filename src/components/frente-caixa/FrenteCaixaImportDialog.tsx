import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { brl as formatPrice } from '@/components/pdv-v2/_format';
import { supabase } from '@/integrations/supabase/client';

export interface ImportableOrderItem {
  id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  price: number;
  notes?: string | null;
}

export interface ImportableOrder {
  id: string;
  short_code: string | null;
  customer_name: string | null;
  total: number;
  status: string;
  created_at: string;
  origin: string | null;
  items: ImportableOrderItem[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  /** 'pedido' = origin cardapio | 'mesa' = origin mesa_qr */
  type: 'pedido' | 'mesa';
  onImport: (order: ImportableOrder) => void;
}

/**
 * Lista pedidos/mesas do dia que ainda NÃO foram cobrados nem entregues
 * (`pdv_sale_id IS NULL` e status != delivered) para o operador da
 * Frente de Caixa importar para o carrinho.
 *
 * Itens importados são imutáveis no carrinho do FC (não podem ser
 * editados nem removidos). Apenas novos itens podem ser adicionados
 * em cima antes do fechamento da venda.
 */
export function FrenteCaixaImportDialog({
  open,
  onOpenChange,
  companyId,
  type,
  onImport,
}: Props) {
  const [orders, setOrders] = useState<ImportableOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const title = type === 'mesa' ? 'Importar mesa' : 'Importar pedido';
  const emptyMsg =
    type === 'mesa'
      ? 'Nenhuma mesa aberta hoje sem cobrança.'
      : 'Nenhum pedido do dia disponível para importar.';

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Início do dia em America/Sao_Paulo
        const tzOffset = -3 * 60; // BRT (-03:00). Suficiente p/ filtro de "dia".
        const now = new Date();
        const startLocal = new Date(now);
        startLocal.setHours(0, 0, 0, 0);
        const startIso = new Date(
          startLocal.getTime() - (now.getTimezoneOffset() - tzOffset) * 60 * 1000,
        ).toISOString();

        const originValues = type === 'mesa' ? ['mesa_qr'] : ['cardapio'];

        const { data, error } = await supabase
          .from('orders')
          .select(
            `id, short_code, customer_name, total, status, created_at, origin, pdv_sale_id,
             items:order_items(id, product_id, name, quantity, price, notes)`,
          )
          .eq('company_id', companyId)
          .in('origin', originValues)
          .is('pdv_sale_id', null)
          .neq('status', 'delivered')
          .gte('created_at', startIso)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        const mapped: ImportableOrder[] = (data || []).map((row: any) => ({
          id: row.id,
          short_code: row.short_code,
          customer_name: row.customer_name,
          total: Number(row.total) || 0,
          status: row.status,
          created_at: row.created_at,
          origin: row.origin,
          items: (row.items || []).map((it: any) => ({
            id: it.id,
            product_id: it.product_id,
            name: it.name,
            quantity: Number(it.quantity) || 0,
            price: Number(it.price) || 0,
            notes: it.notes,
          })),
        }));
        setOrders(mapped);
      } catch (err) {
        console.error('[FrenteCaixaImportDialog] fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId, type]);

  const fmtTime = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      }),
    [],
  );

  function statusLabel(s: string) {
    if (s === 'pending') return 'Pendente';
    if (s === 'preparing') return 'Em preparo';
    if (s === 'ready') return 'Pronto';
    return s;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Pedidos do dia que ainda não foram cobrados. Após importar, os itens
          serão adicionados ao carrinho e <strong>não poderão ser editados nem removidos</strong>.
          O pedido original continua existindo — apenas será marcado como pago após o
          fechamento da venda.
        </p>

        <ScrollArea className="flex-1 -mx-2 px-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              {emptyMsg}
            </div>
          ) : (
            <ul className="space-y-2 py-2">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="border rounded-md p-3 bg-card flex flex-col gap-2 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">
                          {o.short_code || '—'}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {statusLabel(o.status)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {fmtTime.format(new Date(o.created_at))}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {o.customer_name || 'Sem cliente'} ·{' '}
                        {o.items.length} {o.items.length === 1 ? 'item' : 'itens'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold tabular-nums text-emerald-600">
                        {formatPrice(o.total)}
                      </p>
                    </div>
                  </div>

                  <ul className="text-xs text-muted-foreground space-y-0.5 pl-1">
                    {o.items.slice(0, 4).map((it) => (
                      <li key={it.id} className="truncate">
                        {it.quantity}× {it.name}
                      </li>
                    ))}
                    {o.items.length > 4 && (
                      <li>… e mais {o.items.length - 4}</li>
                    )}
                  </ul>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        onImport(o);
                        onOpenChange(false);
                      }}
                    >
                      Importar para o caixa
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}