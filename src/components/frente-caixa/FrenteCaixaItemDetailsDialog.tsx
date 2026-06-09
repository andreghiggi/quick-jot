import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { brl as formatPrice } from '@/components/pdv-v2/_format';

export interface ItemDetailsResult {
  quantity: number;
  /** Preço unitário efetivo (sobrescreve unit_price original) */
  unitPrice: number;
  /** Desconto em R$ por linha */
  discount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  code: string;
  productName: string;
  unit: string;
  initialQuantity: number;
  initialUnitPrice: number;
  initialDiscount: number;
  onConfirm: (r: ItemDetailsResult) => void;
  onRemove: () => void;
}

/**
 * Espelha o modal "Editar detalhes" do Gweb (aba IDENTIFICAÇÃO).
 * A aba ADICIONAIS foi omitida nesta versão a pedido.
 */
export function FrenteCaixaItemDetailsDialog({
  open,
  onOpenChange,
  code,
  productName,
  unit,
  initialQuantity,
  initialUnitPrice,
  initialDiscount,
  onConfirm,
  onRemove,
}: Props) {
  const [qty, setQty] = useState(String(initialQuantity));
  const [unitPrice, setUnitPrice] = useState(initialUnitPrice.toFixed(3).replace('.', ','));
  const [discount, setDiscount] = useState(initialDiscount.toFixed(2).replace('.', ','));

  useEffect(() => {
    if (open) {
      setQty(String(initialQuantity));
      setUnitPrice(initialUnitPrice.toFixed(3).replace('.', ','));
      setDiscount(initialDiscount.toFixed(2).replace('.', ','));
    }
  }, [open, initialQuantity, initialUnitPrice, initialDiscount]);

  const qtyNum = Math.max(0.001, Number(qty.replace(',', '.')) || 0);
  const upNum = Math.max(0, Number(unitPrice.replace(/\./g, '').replace(',', '.')) || 0);
  const discNum = Math.max(0, Number(discount.replace(/\./g, '').replace(',', '.')) || 0);
  const total = Math.max(0, upNum * qtyNum - discNum);

  function submit() {
    onConfirm({ quantity: qtyNum, unitPrice: upNum, discount: discNum });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        {/* Aba (sem ADICIONAIS por enquanto) */}
        <div className="px-4 pt-3">
          <div className="bg-primary text-primary-foreground text-center font-semibold uppercase text-xs py-2 rounded-sm tracking-wider">
            Identificação
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-[160px_1fr] gap-6">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Código/GTIN</div>
              <div className="text-base border-b border-dashed border-border pb-1 truncate">{code}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Produto</div>
              <div className="text-base border-b border-dashed border-border pb-1 truncate">
                {productName}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground text-right">Quantidade</div>
              <Input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                autoFocus
                className="h-10 text-right text-base tabular-nums"
              />
              <div className="text-[11px] text-muted-foreground text-right">{unit}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground text-right">Valor unitário</div>
              <Input
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 text-right text-base tabular-nums"
                inputMode="decimal"
              />
              <div className="text-[11px] text-muted-foreground text-right">R$</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Quantidade convertida</div>
              <div className="text-base text-muted-foreground tabular-nums">
                {qtyNum.toLocaleString('pt-BR')} {unit}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground text-right">Desconto</div>
              <Input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 text-right text-base tabular-nums"
                inputMode="decimal"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <div className="text-[11px] text-muted-foreground text-right">Desconto em R$</div>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-dashed">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Valor total</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-600">
                {formatPrice(total)}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t flex !justify-between sm:!justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive uppercase"
            onClick={() => {
              onRemove();
              onOpenChange(false);
            }}
          >
            Remover
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="uppercase">
              Cancelar
            </Button>
            <Button onClick={submit} className="uppercase">Confirmar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}