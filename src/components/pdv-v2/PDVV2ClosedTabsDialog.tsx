import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Receipt } from 'lucide-react';
import { getNFCeRecordBySaleId, type NFCeRecord } from '@/services/nfceService';
import { useAuthContext } from '@/contexts/AuthContext';
import { PDVV2ClosedTabSaleCard } from './PDVV2ClosedTabSaleCard';
import { PDVV2CancelSaleDialog, CancelSaleTarget } from './PDVV2CancelSaleDialog';
import { loadCancellationsBySaleIds, SaleCancellationRecord } from '@/utils/saleCancellation';

export interface ClosedTabSale {
  id: string;
  final_total: number;
  customer_name: string | null;
  notes: string | null;
  created_at: string | null;
  payment_method_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sales: ClosedTabSale[];
  companyId?: string;
  paperSize?: '58mm' | '80mm';
  printLayout?: 'v1' | 'v2' | 'v3';
  onSaleDeleted: () => void;
  registerId?: string | null;
}

export function PDVV2ClosedTabsDialog({ open, onOpenChange, sales, companyId, paperSize = '80mm', printLayout, onSaleDeleted, registerId }: Props) {
  const { user, profile } = useAuthContext();
  const [nfceMap, setNfceMap] = useState<Record<string, NFCeRecord | null>>({});
  const [cancelMap, setCancelMap] = useState<Record<string, SaleCancellationRecord>>({});
  const [cancelTarget, setCancelTarget] = useState<CancelSaleTarget | null>(null);

  useEffect(() => {
    if (!open) return;
    let aborted = false;
    (async () => {
      const entries = await Promise.all(
        sales.map(async (s) => {
          try { return [s.id, await getNFCeRecordBySaleId(s.id)] as const; }
          catch { return [s.id, null] as const; }
        })
      );
      if (aborted) return;
      const map: Record<string, NFCeRecord | null> = {};
      entries.forEach(([id, rec]) => { map[id] = rec; });
      setNfceMap(map);
      try {
        const cancelled = sales.filter((s) => s.notes?.includes('[CANCELADA]')).map((s) => s.id);
        if (cancelled.length) {
          const m = await loadCancellationsBySaleIds(cancelled);
          if (!aborted) setCancelMap(m);
        } else {
          setCancelMap({});
        }
      } catch (e) { console.error('[ClosedTabs] cancellations', e); }
    })();
    return () => { aborted = true; };
  }, [open, sales]);

  const sorted = useMemo(
    () => [...sales].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [sales]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85dvh] max-h-[85dvh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Comandas Finalizadas
          </DialogTitle>
          <DialogDescription>
            Comandas fechadas no caixa atual. Você pode reimprimir, cancelar a venda ou cancelar a NFC-e.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pr-4">
          {sorted.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Nenhuma comanda finalizada neste caixa.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 pb-2">
              {sorted.map((s) => (
                <PDVV2ClosedTabSaleCard
                  key={s.id}
                  sale={s}
                  nfce={nfceMap[s.id] || null}
                  cancellation={cancelMap[s.id] || null}
                  companyId={companyId}
                  paperSize={paperSize}
                  printLayout={printLayout}
                  allowCancelSale
                  onRequestCancelSale={(sale) => setCancelTarget(sale)}
                  onNfceChanged={(saleId, rec) => setNfceMap((m) => ({ ...m, [saleId]: rec }))}
                />
              ))}
            </div>
          )}
        </div>

        <PDVV2CancelSaleDialog
          open={!!cancelTarget}
          onOpenChange={(v) => { if (!v) setCancelTarget(null); }}
          sale={cancelTarget}
          companyId={companyId}
          registerId={registerId || null}
          userId={user?.id || null}
          userName={profile?.full_name || user?.email || null}
          onConfirmed={() => { setCancelTarget(null); onSaleDeleted(); }}
        />
      </DialogContent>
    </Dialog>
  );
}