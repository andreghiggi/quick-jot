import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { brl as formatPrice } from './_format';

export interface CloseCashSale {
  id: string;
  final_total: number;
  payment_method_name: string;
  origin: 'balcao' | 'cardapio_retirada' | 'cardapio_delivery' | 'mesa' | 'outros';
}

interface PDVV2CloseCashDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expectedAmount: number;
  sales: CloseCashSale[];
  onConfirm: (closingAmount: number, notes: string) => Promise<void>;
}

const ORIGIN_LABEL: Record<CloseCashSale['origin'], string> = {
  balcao: 'Vendas Balcão',
  cardapio_retirada: 'Retiradas (cobradas no PDV)',
  cardapio_delivery: 'Deliveries',
  mesa: 'Mesas Importadas',
  outros: 'Outros',
};

export function PDVV2CloseCashDialog({
  open,
  onOpenChange,
  expectedAmount,
  sales,
  onConfirm,
}: PDVV2CloseCashDialogProps) {
  const [closingAmount, setClosingAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reconcile, setReconcile] = useState<Record<string, string>>({});

  // Group: { [origin]: { [paymentName]: total } }
  const grouped = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const s of sales) {
      const o = s.origin || 'outros';
      const p = s.payment_method_name || 'Sem forma';
      if (!out[o]) out[o] = {};
      out[o][p] = (out[o][p] || 0) + s.final_total;
    }
    return out;
  }, [sales]);

  // Total declared per payment method (across all origins)
  const declaredByPayment = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of sales) {
      const p = s.payment_method_name || 'Sem forma';
      out[p] = (out[p] || 0) + s.final_total;
    }
    return out;
  }, [sales]);

  async function handleConfirm() {
    const v = parseFloat(closingAmount.replace(',', '.')) || 0;
    setSubmitting(true);

    // Build reconciliation note
    const reconcileLines: string[] = [];
    for (const [pay, declared] of Object.entries(declaredByPayment)) {
      const informed = parseFloat((reconcile[pay] || '').replace(',', '.')) || 0;
      const diff = informed - declared;
      reconcileLines.push(
        `${pay}: declarado ${formatPrice(declared)} | informado ${formatPrice(informed)} | diferença ${formatPrice(diff)}`
      );
    }
    const fullNotes = [
      notes,
      reconcileLines.length ? '--- Conciliação ---' : '',
      ...reconcileLines,
    ]
      .filter(Boolean)
      .join('\n');

    await onConfirm(v, fullNotes);
    setSubmitting(false);
    setClosingAmount('');
    setNotes('');
    setReconcile({});
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Fechar Caixa</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3">
          <div className="space-y-4 py-2">
            <div className="rounded-md border p-3 bg-muted/40">
              <p className="text-sm text-muted-foreground">Valor esperado em caixa</p>
              <p className="text-2xl font-bold tabular-nums">{formatPrice(expectedAmount)}</p>
            </div>

            {/* Resumo por origem */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Resumo por origem</h3>
              {Object.keys(grouped).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma venda no caixa.</p>
              ) : (
                Object.entries(grouped).map(([origin, methods]) => {
                  const subtotal = Object.values(methods).reduce((s, v) => s + v, 0);
                  return (
                    <Card key={origin}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <Badge variant="outline">
                            {ORIGIN_LABEL[origin as CloseCashSale['origin']] || origin}
                          </Badge>
                          <span className="font-bold tabular-nums">{formatPrice(subtotal)}</span>
                        </div>
                        <div className="text-xs space-y-1">
                          {Object.entries(methods).map(([pay, val]) => (
                            <div key={pay} className="flex justify-between">
                              <span className="text-muted-foreground">{pay}</span>
                              <span className="tabular-nums">{formatPrice(val)}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Conciliação manual */}
            {Object.keys(declaredByPayment).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Conciliação por forma de pagamento</h3>
                <p className="text-xs text-muted-foreground">
                  Informe o valor que você realmente recebeu em cada forma para validar divergências.
                </p>
                {Object.entries(declaredByPayment).map(([pay, declared]) => {
                  const informed = parseFloat((reconcile[pay] || '').replace(',', '.')) || 0;
                  const diff = informed - declared;
                  const hasInput = (reconcile[pay] || '').length > 0;
                  return (
                    <div key={pay} className="grid grid-cols-[1fr,auto,auto] gap-2 items-center">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{pay}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Declarado: {formatPrice(declared)}
                        </p>
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="Informado"
                        className="w-32"
                        value={reconcile[pay] || ''}
                        onChange={(e) =>
                          setReconcile((s) => ({ ...s, [pay]: e.target.value }))
                        }
                      />
                      <span
                        className={`text-xs tabular-nums w-20 text-right ${
                          !hasInput
                            ? 'text-muted-foreground'
                            : diff === 0
                            ? 'text-green-600'
                            : diff > 0
                            ? 'text-blue-600'
                            : 'text-destructive'
                        }`}
                      >
                        {hasInput ? (diff >= 0 ? `+${formatPrice(diff)}` : formatPrice(diff)) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <Label>Valor real contado em caixa</Label>
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
        </ScrollArea>

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
