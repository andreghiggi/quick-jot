import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Printer, Ban, FileX, Loader2, Receipt, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { brl as formatPrice } from './_format';
import { cancelarNFCe, getNFCeRecordBySaleId, printDanfeFromRecord, type NFCeRecord } from '@/services/nfceService';
import { printOnlyReceipt } from '@/utils/pdvV2Print';
import { parseTefDataFromNotes, reimprimirComprovanteTef, estornarTefPedido, isOrderTefCancelled } from '@/utils/tefOrderActions';

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
  onSaleDeleted: () => void;
}

export function PDVV2ClosedTabsDialog({ open, onOpenChange, sales, companyId, paperSize = '80mm', onSaleDeleted }: Props) {
  const [nfceMap, setNfceMap] = useState<Record<string, NFCeRecord | null>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        sales.map(async (s) => {
          try {
            const rec = await getNFCeRecordBySaleId(s.id);
            return [s.id, rec] as const;
          } catch {
            return [s.id, null] as const;
          }
        })
      );
      if (cancelled) return;
      const map: Record<string, NFCeRecord | null> = {};
      entries.forEach(([id, rec]) => { map[id] = rec; });
      setNfceMap(map);
    })();
    return () => { cancelled = true; };
  }, [open, sales]);

  const sorted = useMemo(
    () => [...sales].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [sales]
  );

  function parseTabNumber(notes: string | null): number | null {
    if (!notes) return null;
    const m = notes.match(/Comanda\s*#?(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  async function handleReprint(sale: ClosedTabSale) {
    if (!companyId) return;
    setLoadingId(sale.id);
    try {
      const { data: items, error } = await supabase
        .from('pdv_sale_items')
        .select('*')
        .eq('sale_id', sale.id);
      if (error) throw error;
      const tabNumber = parseTabNumber(sale.notes) || 0;
      await printOnlyReceipt({
        companyId,
        orderCode: tabNumber ? `M${tabNumber}` : sale.id.slice(0, 6),
        dailyNumber: tabNumber,
        customerName: sale.customer_name || 'Cliente',
        items: (items || []).map((i: any) => ({
          name: i.product_name,
          quantity: i.quantity,
          price: i.unit_price,
        })),
        total: sale.final_total,
        notes: sale.notes || undefined,
        paperSize,
      });
      toast.success('Recibo enviado para impressão');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao reimprimir');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleReprintNFCe(sale: ClosedTabSale) {
    const rec = nfceMap[sale.id];
    if (!rec) return;
    setLoadingId(sale.id);
    try {
      const { data: full, error } = await supabase
        .from('nfce_records')
        .select('*')
        .eq('id', rec.id)
        .maybeSingle();
      if (error) throw error;
      await printDanfeFromRecord(full as any);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao imprimir DANFE');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleCancelSale(sale: ClosedTabSale) {
  async function handleCancelSale(sale: ClosedTabSale) {
    if (!companyId) return;
    const tefInfo = parseTefDataFromNotes(sale.notes);
    const hasPinpadTef = tefInfo?.type === 'pinpad' && !isOrderTefCancelled(sale.notes);

    const baseMsg = `Cancelar a venda de ${formatPrice(sale.final_total)}? Esta ação não pode ser desfeita.`;
    const tefMsg = hasPinpadTef
      ? '\n\nEsta venda possui pagamento TEF (PinPad). O estorno (CNC) será enviado à maquininha automaticamente.'
      : '';
    if (!confirm(baseMsg + tefMsg)) return;

    setLoadingId(sale.id);
    try {
      let finalNotes = `[CANCELADA] ${sale.notes || ''}`.trim();

      // Se há TEF PinPad associado, dispara estorno antes de marcar como cancelada
      if (hasPinpadTef) {
        const estorno = await estornarTefPedido({
          companyId,
          amount: sale.final_total,
          createdAt: sale.created_at || new Date().toISOString(),
          notes: sale.notes,
        });
        if (!estorno.success) {
          toast.error(estorno.message || 'Falha ao estornar TEF. Venda não cancelada.');
          return;
        }
        toast.success(estorno.message || 'TEF estornado com sucesso');
        finalNotes = estorno.cancelledNotes || finalNotes;
      }

      const { error } = await supabase
        .from('pdv_sales')
        .update({ notes: finalNotes })
        .eq('id', sale.id);
      if (error) throw error;
      toast.success('Venda cancelada. Use "Imprimir via cancelada" se necessário.');
      onSaleDeleted();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao cancelar venda');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleCancelNFCe(sale: ClosedTabSale) {
    if (!companyId) return;
    const rec = nfceMap[sale.id];
    if (!rec?.nfce_id) {
      toast.error('Esta venda não possui NFC-e vinculada');
      return;
    }
    const justificativa = prompt('Informe a justificativa do cancelamento (mín. 15 caracteres):');
    if (!justificativa || justificativa.length < 15) {
      toast.error('Justificativa inválida');
      return;
    }
    setLoadingId(sale.id);
    try {
      await cancelarNFCe(companyId, rec.nfce_id, justificativa);
      toast.success('Cancelamento de NFC-e solicitado');
      const updated = await getNFCeRecordBySaleId(sale.id);
      setNfceMap((m) => ({ ...m, [sale.id]: updated }));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao cancelar NFC-e');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Comandas Finalizadas
          </DialogTitle>
          <DialogDescription>
            Comandas fechadas no caixa atual. Você pode reimprimir, cancelar a venda ou cancelar a NFC-e.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {sorted.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Nenhuma comanda finalizada neste caixa.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 pb-2">
              {sorted.map((s) => {
                const tabNumber = parseTabNumber(s.notes);
                const nfce = nfceMap[s.id];
                const isLoading = loadingId === s.id;
                const time = s.created_at ? new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                const nfceCancelled = nfce?.status === 'cancelada';
                const isCancelled = !!s.notes?.includes('[CANCELADA]');
                const tefInfo = parseTefDataFromNotes(s.notes);
                const hasTefReceipt = !!tefInfo?.receipt;
                return (
                  <Card key={s.id} className={isCancelled ? 'border-destructive/40 bg-destructive/5' : ''}>
                    <CardContent className="p-3 space-y-2">
                      {isCancelled && (
                        <div className="flex items-center justify-center gap-2 py-1 px-2 rounded bg-destructive/10 border border-destructive/20">
                          <span className="text-xs font-bold text-destructive tracking-wider">⛔ VENDA CANCELADA</span>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">
                              {tabNumber ? `Comanda #${tabNumber}` : 'Venda'}
                            </span>
                            {nfce && (
                              <Badge variant={nfceCancelled ? 'destructive' : nfce.status === 'autorizada' ? 'default' : 'secondary'} className="text-[10px]">
                                NFC-e {nfce.status}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">{time}</span>
                          </div>
                          {s.customer_name && (
                            <p className="text-xs text-muted-foreground truncate">{s.customer_name}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{s.payment_method_name}</p>
                        </div>
                        <span className={`font-bold tabular-nums text-sm shrink-0 ${isCancelled ? 'line-through text-destructive/70' : ''}`}>
                          {formatPrice(s.final_total)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isLoading}
                          onClick={() => handleReprint(s)}
                        >
                          {isLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Printer className="h-3 w-3 mr-1" />}
                          Reimprimir Venda
                        </Button>
                        {hasTefReceipt && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoading}
                            onClick={() => reimprimirComprovanteTef(s.notes, tabNumber ? `M${tabNumber}` : s.id.slice(0, 6))}
                            className="text-blue-600 hover:text-blue-700"
                            title="Reimprimir comprovante TEF (2ª via)"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {isCancelled ? 'Imprimir via cancelada' : 'Reimprimir TEF'}
                          </Button>
                        )}
                        {nfce && nfce.chave_acesso && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoading}
                            onClick={() => handleReprintNFCe(s)}
                          >
                            <Printer className="h-3 w-3 mr-1" />
                            Reimprimir NFC-e
                          </Button>
                        )}
                        {nfce?.nfce_id && !nfceCancelled && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoading}
                            onClick={() => handleCancelNFCe(s)}
                          >
                            <FileX className="h-3 w-3 mr-1" />
                            Cancelar NFC-e
                          </Button>
                        )}
                        {!isCancelled && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isLoading}
                            onClick={() => handleCancelSale(s)}
                          >
                            <Ban className="h-3 w-3 mr-1" />
                            Cancelar Venda
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}