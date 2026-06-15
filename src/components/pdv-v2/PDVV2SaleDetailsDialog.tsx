import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { brl } from './_format';

interface SaleItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  saleId: string | null;
  companyId?: string;
  tabNumber: number | null;
  saleCreatedAt: string | null;
  finalTotal: number;
  customerName: string | null;
  paymentMethodName: string;
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

export function PDVV2SaleDetailsDialog({
  open, onOpenChange, saleId, companyId, tabNumber, saleCreatedAt,
  finalTotal, customerName, paymentMethodName,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [openedAt, setOpenedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !saleId) return;
    let aborted = false;
    (async () => {
      setLoading(true);
      try {
        const { data: rows } = await supabase
          .from('pdv_sale_items')
          .select('id, product_name, quantity, unit_price, total_price')
          .eq('sale_id', saleId)
          .order('created_at', { ascending: true });
        if (aborted) return;
        setItems((rows || []) as SaleItem[]);

        // Busca a comanda correspondente (tabs) por número e empresa,
        // priorizando a fechada mais próxima da data da venda.
        if (companyId && tabNumber != null) {
          const { data: tabs } = await supabase
            .from('tabs')
            .select('created_at, closed_at, status')
            .eq('company_id', companyId)
            .eq('tab_number', tabNumber)
            .order('created_at', { ascending: false })
            .limit(20);
          if (aborted) return;
          const saleTs = saleCreatedAt ? new Date(saleCreatedAt).getTime() : Date.now();
          const best = (tabs || [])
            .map((t: any) => ({
              created_at: t.created_at as string,
              closed_at: t.closed_at as string | null,
              diff: Math.abs(new Date(t.closed_at || t.created_at).getTime() - saleTs),
            }))
            .sort((a, b) => a.diff - b.diff)[0];
          setOpenedAt(best?.created_at || null);
        } else {
          setOpenedAt(null);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, [open, saleId, companyId, tabNumber, saleCreatedAt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {tabNumber ? `Comanda #${tabNumber}` : 'Detalhes da venda'}
          </DialogTitle>
          <DialogDescription>
            Itens consumidos e horários de abertura e fechamento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 text-xs rounded border bg-muted/30 p-3 shrink-0">
          <div>
            <div className="text-muted-foreground">Aberta em</div>
            <div className="font-medium">{fmtDateTime(openedAt)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Fechada em</div>
            <div className="font-medium">{fmtDateTime(saleCreatedAt)}</div>
          </div>
          {customerName && (
            <div className="col-span-2">
              <div className="text-muted-foreground">Cliente</div>
              <div className="font-medium truncate">{customerName}</div>
            </div>
          )}
          <div className="col-span-2">
            <div className="text-muted-foreground">Pagamento</div>
            <div className="font-medium">{paymentMethodName}</div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando itens…
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhum item registrado.
            </div>
          ) : (
            <div className="divide-y border rounded">
              {items.map((it) => (
                <div key={it.id} className="flex items-start justify-between gap-3 p-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{it.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {Number(it.quantity)} × {brl(Number(it.unit_price))}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums shrink-0">
                    {brl(Number(it.total_price))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t shrink-0">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-lg font-bold tabular-nums">{brl(finalTotal)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}