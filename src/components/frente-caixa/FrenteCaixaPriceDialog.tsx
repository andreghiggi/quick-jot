import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CurrencyInput, parseDecimalLivre } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { brl as formatPrice } from '@/components/pdv-v2/_format';

export type PriceMode = 'discount' | 'override' | 'surcharge';

export interface PriceChange {
  mode: PriceMode;
  /** Valor digitado em R$ (por linha, não por unidade) */
  value: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  productName: string;
  initialUnitPrice: number;
  quantity: number;
  onConfirm: (change: PriceChange) => void;
}

/**
 * Espelha o modal "Alteração no preço do item" do Gweb.
 * Aplica DESCONTO (R$), ALTERAÇÃO no valor unitário (R$) ou ACRÉSCIMO (R$).
 * Tudo por linha, separado do desconto/acréscimo da venda toda.
 */
export function FrenteCaixaPriceDialog({
  open,
  onOpenChange,
  productName,
  initialUnitPrice,
  quantity,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<PriceMode>('override');
  const [raw, setRaw] = useState('0,00');

  useEffect(() => {
    if (open) {
      setMode('override');
      setRaw('0,00');
    }
  }, [open]);

  function parseValue(): number {
    const n = parseDecimalLivre(raw);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === '-') {
      e.preventDefault();
      setMode('discount');
    } else if (e.key === '=') {
      e.preventDefault();
      setMode('override');
    } else if (e.key === '+') {
      e.preventDefault();
      setMode('surcharge');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const v = parseValue();
    onConfirm({ mode, value: v });
    onOpenChange(false);
  }

  const label =
    mode === 'discount' ? 'Desconto (R$)' :
    mode === 'override' ? 'Novo valor unitário (R$)' :
    'Acréscimo (R$)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onKeyDown={handleKey}>
        <DialogHeader>
          <DialogTitle className="text-xl">Alteração no preço do item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Item: </span>
            <span className="font-bold uppercase">{productName}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Preço inicial: </span>
            <span className="font-bold">{formatPrice(initialUnitPrice)}</span>
            <span className="text-muted-foreground"> × {quantity}</span>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <RadioOpt active={mode === 'discount'} onClick={() => setMode('discount')} label="Desconto" hotkey="-" />
            <RadioOpt active={mode === 'override'} onClick={() => setMode('override')} label="Alteração no valor" hotkey="=" />
            <RadioOpt active={mode === 'surcharge'} onClick={() => setMode('surcharge')} label="Acréscimo" hotkey="+" />
          </div>

          <div className="space-y-1 pt-2">
            <div className="text-xs text-muted-foreground">{label}</div>
            <CurrencyInput
              autoFocus
              value={raw}
              onValueChange={(_, text) => setRaw(text)}
              formatEmptyAsZero
              onFocus={(e) => e.currentTarget.select()}
              className="h-12 text-lg text-right tabular-nums"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="uppercase">
            Cancelar
          </Button>
          <Button onClick={submit} className="uppercase">Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RadioOpt({ active, onClick, label, hotkey }: { active: boolean; onClick: () => void; label: string; hotkey: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 text-sm ${active ? 'text-foreground' : 'text-muted-foreground'}`}
    >
      <span
        className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
          active ? 'border-primary' : 'border-muted-foreground'
        }`}
      >
        {active && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className={active ? 'font-medium' : ''}>{label}</span>
      <kbd className="px-1.5 py-0.5 border rounded text-[10px] bg-muted">{hotkey}</kbd>
    </button>
  );
}