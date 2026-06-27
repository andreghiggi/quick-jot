import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { Product } from '@/types/product';

interface Props {
  product: Product | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: (weightKg: number) => void;
}

/**
 * Modal para informar peso manual (KG) de um produto vendido por peso.
 * - Aceita vírgula ou ponto. Preço por kg vem do `product.price`.
 * - Enter confirma; Esc cancela. Auto-foco no campo.
 */
export function FrenteCaixaWeightDialog({ product, open, onCancel, onConfirm }: Props) {
  const [text, setText] = useState('');
  const pricePerKg = Number(product?.price) || 0;
  const parsed = Number(String(text).replace(',', '.'));
  const validWeight = !Number.isNaN(parsed) && parsed > 0;
  const total = validWeight ? parsed * pricePerKg : 0;

  useEffect(() => {
    if (open) setText('');
  }, [open]);

  function confirm() {
    if (!validWeight) return;
    onConfirm(parsed);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Informar peso</DialogTitle>
          <DialogDescription>
            {product?.name} — {pricePerKg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / kg
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Peso em kg</Label>
            <Input
              autoFocus
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirm(); }
              }}
              placeholder="Ex.: 0,350"
              className="text-xl text-right h-12"
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              Use vírgula ou ponto. Ex.: 0,250 = 250 gramas.
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total do item</span>
            <span className="text-lg font-bold text-emerald-600">
              {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={confirm} disabled={!validWeight}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}