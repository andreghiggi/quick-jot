import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { brl as formatPrice } from './_format';
import { PDVV2DocumentModeSelector, DocumentMode } from './PDVV2DocumentModeSelector';

interface PDVV2PaymentDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  total: number;
  title?: string;
  /** Show "Geração de Documentos" + "Impressão Automática" — habilitar para balcão/retirada/mesa */
  showDocumentMode?: boolean;
  onConfirm: (params: {
    paymentMethodId: string;
    paymentName: string;
    discount: number;
    finalTotal: number;
    documentMode: DocumentMode;
  }) => Promise<void> | void;
}

export function PDVV2PaymentDialog({
  open,
  onOpenChange,
  companyId,
  total,
  title = 'Cobrança',
  showDocumentMode = false,
  onConfirm,
}: PDVV2PaymentDialogProps) {
  const { activePaymentMethods } = usePaymentMethods({ companyId, channel: 'pdv' });
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [discount, setDiscount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [documentMode, setDocumentMode] = useState<DocumentMode>(() => {
    const saved = localStorage.getItem('pdv_document_mode');
    return saved === 'sale_with_nfce' ? 'sale_with_nfce' : 'sale_only';
  });

  // Detecta se o método selecionado é TEF — força NFC-e (mesma regra do V1)
  const selectedMethod = activePaymentMethods.find((m) => m.id === paymentMethodId);
  const integration = (selectedMethod as any)?.integration_type as string | undefined;
  const isTef = integration === 'tef_pinpad' || integration === 'tef_smartpos';
  const effectiveDocumentMode: DocumentMode = isTef ? 'sale_with_nfce' : documentMode;

  useEffect(() => {
    if (open && activePaymentMethods.length > 0 && !paymentMethodId) {
      setPaymentMethodId(activePaymentMethods[0].id);
    }
  }, [open, activePaymentMethods, paymentMethodId]);

  useEffect(() => {
    if (!open) {
      setDiscount('');
      setSubmitting(false);
    }
  }, [open]);

  const discountValue = parseFloat(discount.replace(',', '.')) || 0;
  const finalTotal = Math.max(0, total - discountValue);

  async function handleConfirm() {
    const method = activePaymentMethods.find((m) => m.id === paymentMethodId);
    if (!method) return;
    setSubmitting(true);
    await onConfirm({
      paymentMethodId,
      paymentName: method.name,
      discount: discountValue,
      finalTotal,
      documentMode: effectiveDocumentMode,
    });
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 bg-muted/40">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold tabular-nums">{formatPrice(finalTotal)}</p>
            {discountValue > 0 && (
              <p className="text-xs text-muted-foreground">
                Subtotal: {formatPrice(total)} − Desconto: {formatPrice(discountValue)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Desconto (R$)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0,00"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            {activePaymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma forma de pagamento ativa para o canal PDV.
              </p>
            ) : (
              <RadioGroup value={paymentMethodId} onValueChange={setPaymentMethodId}>
                {activePaymentMethods.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 border rounded-md p-2">
                    <RadioGroupItem value={m.id} id={`pm-${m.id}`} />
                    <Label htmlFor={`pm-${m.id}`} className="flex-1 cursor-pointer">
                      {m.name}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || !paymentMethodId || activePaymentMethods.length === 0}
          >
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
