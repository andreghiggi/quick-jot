import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, Ban, FileX, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { brl as formatPrice } from './_format';
import { cancelarNFCe, printDanfeFromRecord, type NFCeRecord, getNFCeRecordBySaleId } from '@/services/nfceService';
import { printOnlyReceipt } from '@/utils/pdvV2Print';
import { parseTefDataFromNotes, reimprimirComprovanteTef } from '@/utils/tefOrderActions';
import { formatCancelledAt, SaleCancellationRecord } from '@/utils/saleCancellation';

export interface ClosedTabSaleCardData {
  id: string;
  final_total: number;
  customer_name: string | null;
  notes: string | null;
  created_at: string | null;
  payment_method_name: string;
}

interface Props {
  sale: ClosedTabSaleCardData;
  nfce: NFCeRecord | null;
  cancellation?: SaleCancellationRecord | null;
  companyId?: string;
  paperSize?: '58mm' | '80mm';
  printLayout?: 'v1' | 'v2' | 'v3';
  allowCancelSale: boolean;
  onRequestCancelSale: (sale: ClosedTabSaleCardData) => void;
  onNfceChanged?: (saleId: string, rec: NFCeRecord | null) => void;
}

function parseTabNumber(notes: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(/Comanda\s*#?(\d+)/i);
  return m ? Number(m[1]) : null;
}

export function PDVV2ClosedTabSaleCard({
  sale, nfce, cancellation, companyId, paperSize = '80mm', printLayout,
  allowCancelSale, onRequestCancelSale, onNfceChanged,
}: Props) {
  const [loading, setLoading] = useState(false);
  const tabNumber = parseTabNumber(sale.notes);
  const time = sale.created_at
    ? new Date(sale.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : '';
  const nfceCancelled = nfce?.status === 'cancelada';
  const isCancelled = !!sale.notes?.includes('[CANCELADA]');
  const tefInfo = parseTefDataFromNotes(sale.notes);
  const hasTefReceipt = !!tefInfo?.receipt;

  async function handleReprint() {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: items, error } = await supabase
        .from('pdv_sale_items').select('*').eq('sale_id', sale.id);
      if (error) throw error;
      await printOnlyReceipt({
        companyId,
        orderCode: tabNumber ? `M${tabNumber}` : sale.id.slice(0, 6),
        dailyNumber: tabNumber || 0,
        customerName: sale.customer_name || 'Cliente',
        items: (items || []).map((i: any) => ({ name: i.product_name, quantity: i.quantity, price: i.unit_price })),
        total: sale.final_total,
        notes: sale.notes || undefined,
        paperSize,
        printLayout,
      });
      toast.success('Recibo enviado para impressão');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao reimprimir');
    } finally { setLoading(false); }
  }

  async function handleReprintNFCe() {
    if (!nfce) return;
    setLoading(true);
    try {
      const { data: full, error } = await supabase
        .from('nfce_records').select('*').eq('id', nfce.id).maybeSingle();
      if (error) throw error;
      await printDanfeFromRecord(full as any);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao imprimir DANFE');
    } finally { setLoading(false); }
  }

  async function handleCancelNFCe() {
    if (!companyId || !nfce?.nfce_id) return;
    const justificativa = prompt('Informe a justificativa do cancelamento (mín. 15 caracteres):');
    if (!justificativa || justificativa.length < 15) {
      toast.error('Justificativa inválida');
      return;
    }
    setLoading(true);
    try {
      await cancelarNFCe(companyId, nfce.nfce_id, justificativa);
      toast.success('Cancelamento de NFC-e solicitado');
      const updated = await getNFCeRecordBySaleId(sale.id);
      onNfceChanged?.(sale.id, updated);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao cancelar NFC-e');
    } finally { setLoading(false); }
  }

  return (
    <Card className={isCancelled ? 'border-destructive/40 bg-destructive/5' : ''}>
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
            {sale.customer_name && (
              <p className="text-xs text-muted-foreground truncate">{sale.customer_name}</p>
            )}
            <p className="text-xs text-muted-foreground">{sale.payment_method_name}</p>
          </div>
          <span className={`font-bold tabular-nums text-sm shrink-0 ${isCancelled ? 'line-through text-destructive/70' : ''}`}>
            {formatPrice(sale.final_total)}
          </span>
        </div>

        {isCancelled && (
          <div className="text-xs rounded border border-destructive/30 bg-destructive/5 p-2 space-y-0.5">
            <div>
              <span className="text-muted-foreground">Motivo: </span>
              <span className="font-medium">{cancellation?.reason || 'Motivo não informado'}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 text-muted-foreground">
              <span>Por: <strong className="text-foreground">{cancellation?.cancelled_by_name || '—'}</strong></span>
              <span>Em: <strong className="text-foreground">{cancellation?.cancelled_at ? formatCancelledAt(cancellation.cancelled_at) : '—'}</strong></span>
              {cancellation?.tef_reversed && <span className="text-destructive font-medium">TEF estornado</span>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" disabled={loading} onClick={handleReprint}>
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Printer className="h-3 w-3 mr-1" />}
            Reimprimir Venda
          </Button>
          {hasTefReceipt && (
            <Button
              size="sm" variant="outline" disabled={loading}
              onClick={() => reimprimirComprovanteTef(sale.notes, tabNumber ? `M${tabNumber}` : sale.id.slice(0, 6))}
              className="text-blue-600 hover:text-blue-700"
              title="Reimprimir comprovante TEF (2ª via)"
            >
              <FileText className="h-3 w-3 mr-1" />
              {isCancelled ? 'Imprimir via cancelada' : 'Reimprimir TEF'}
            </Button>
          )}
          {nfce?.chave_acesso && (
            <Button size="sm" variant="outline" disabled={loading} onClick={handleReprintNFCe}>
              <Printer className="h-3 w-3 mr-1" /> Reimprimir NFC-e
            </Button>
          )}
          {nfce?.nfce_id && !nfceCancelled && (
            <Button size="sm" variant="outline" disabled={loading} onClick={handleCancelNFCe}>
              <FileX className="h-3 w-3 mr-1" /> Cancelar NFC-e
            </Button>
          )}
          {allowCancelSale && !isCancelled && (
            <Button size="sm" variant="destructive" disabled={loading} onClick={() => onRequestCancelSale(sale)}>
              <Ban className="h-3 w-3 mr-1" /> Cancelar Venda
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}