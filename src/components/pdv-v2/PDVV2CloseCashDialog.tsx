import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatPrice } from '@/lib/utils';

interface PDVV2CloseCashDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expectedAmount: number;
  onConfirm: (closingAmount: number, notes: string) => Promise<void>;
}

export function PDVV2CloseCashDialog({
  open,
  onOpenChange,
  expectedAmount,
  onConfirm,
}: PDVV2CloseCashDialogProps) {
  const [closingAmount, setClosingAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    const v = parseFloat(closingAmount.replace(',', '.')) || 0;
    setSubmitting(true);
    await onConfirm(v, notes);
    setSubmitting(false);
    setClosingAmount('');
    setNotes('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar Caixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 bg-muted/40">
            <p className="text-sm text-muted-foreground">Valor esperado em caixa</p>
            <p className="text-2xl font-bold tabular-nums">{formatPrice(expectedAmount)}</p>
          </div>
          <div className="space-y-2">
            <Label>Valor real contado</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0,00"
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas do fechamento..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            Confirmar Fechamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
