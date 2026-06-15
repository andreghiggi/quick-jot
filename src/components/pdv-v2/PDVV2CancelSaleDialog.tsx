import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { brl as formatPrice } from './_format';
import { CANCEL_REASON_MIN_LENGTH, buildCancelledNotes, insertSaleCancellation } from '@/utils/saleCancellation';
import { parseTefDataFromNotes, estornarTefPedido, isOrderTefCancelled } from '@/utils/tefOrderActions';

export interface CancelSaleTarget {
  id: string;
  final_total: number;
  notes: string | null;
  created_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: CancelSaleTarget | null;
  companyId?: string;
  registerId?: string | null;
  userId?: string | null;
  userName?: string | null;
  onConfirmed: () => void;
}

export function PDVV2CancelSaleDialog({ open, onOpenChange, sale, companyId, registerId, userId, userName, onConfirmed }: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setReason('');
  }, [open, sale?.id]);

  if (!sale) return null;

  const trimmed = reason.trim();
  const remaining = Math.max(0, CANCEL_REASON_MIN_LENGTH - trimmed.length);
  const canSubmit = trimmed.length >= CANCEL_REASON_MIN_LENGTH && !submitting && !!companyId;

  const tefInfo = parseTefDataFromNotes(sale.notes);
  const hasPinpadTef = tefInfo?.type === 'pinpad' && !isOrderTefCancelled(sale.notes);

  async function handleConfirm() {
    if (!canSubmit || !companyId || !sale) return;
    setSubmitting(true);
    try {
      let baseNotes = sale.notes || '';
      let tefReversed = false;

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
        tefReversed = true;
        if (estorno.cancelledNotes) baseNotes = estorno.cancelledNotes;
        toast.success(estorno.message || 'TEF estornado com sucesso');
      }

      const finalNotes = buildCancelledNotes(baseNotes, trimmed);
      const { error } = await supabase
        .from('pdv_sales')
        .update({ notes: finalNotes })
        .eq('id', sale.id);
      if (error) throw error;

      await insertSaleCancellation({
        saleId: sale.id,
        companyId,
        registerId: registerId || null,
        cancelledBy: userId || null,
        cancelledByName: userName || null,
        reason: trimmed,
        tefReversed,
      });

      toast.success('Venda cancelada e motivo registrado.');
      onOpenChange(false);
      onConfirmed();
    } catch (e: any) {
      console.error('[CancelSale]', e);
      toast.error(e?.message || 'Erro ao cancelar venda');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="h-5 w-5" /> Cancelar venda
          </DialogTitle>
          <DialogDescription>
            Valor: <strong>{formatPrice(sale.final_total)}</strong>. Esta ação não pode ser desfeita
            {hasPinpadTef && ' e disparará o estorno TEF (PinPad) automaticamente'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="cancel-reason">
            Motivo do cancelamento <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Descreva o motivo do cancelamento (mínimo 20 caracteres)…"
            rows={4}
            disabled={submitting}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {remaining > 0
              ? `Faltam ${remaining} caractere(s) para o mínimo.`
              : 'Motivo válido.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Ban className="h-4 w-4 mr-1" />}
            Cancelar venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}