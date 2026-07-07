/**
 * Diálogo "Efetivar receita" — inspirado no checkout da Frente de Caixa.
 *
 * Lista as formas de pagamento com atalho por letra (A, B, C…), permitindo
 * split de pagamento direto (várias linhas somando o total). Contempla
 * juros/multa/desconto/acréscimo no cálculo do "Falta".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { brl, maskCurrencyInput, parseCurrencyInput } from '@/components/pdv-v2/_format';
import type { AccountReceivable } from '@/hooks/useAccountsReceivable';

export interface EfetivarPayment {
  amount: number;
  paymentMethodId?: string | null;
  paymentName: string;
}

export interface EfetivarSubmit {
  interest: number;
  fine: number;
  discount: number;
  surcharge: number;
  payments: EfetivarPayment[];
  /** Operador optou por emitir NFC-e após o recebimento. Sempre `true`
   *  quando alguma linha usa forma de pagamento TEF (obrigatório por lei). */
  emitNfce: boolean;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function EfetivarReceitaDialog({
  open,
  onOpenChange,
  receivable,
  receivables,
  paymentMethods,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  receivable: AccountReceivable | null;
  /** Quando informado, efetiva várias parcelas juntas (venda inteira). */
  receivables?: AccountReceivable[] | null;
  paymentMethods: Array<{ id: string; name: string; integrationType?: string | null }>;
  onConfirm: (data: EfetivarSubmit) => Promise<void> | void;
  busy: boolean;
}) {
  const [interest, setInterest] = useState('0,00');
  const [fine, setFine] = useState('0,00');
  const [discount, setDiscount] = useState('0,00');
  const [surcharge, setSurcharge] = useState('0,00');
  const [lines, setLines] = useState<Record<string, string>>({});
  const [emitNfce, setEmitNfce] = useState(false);
  const lineRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const list = useMemo(
    () => (receivables && receivables.length ? receivables : receivable ? [receivable] : []),
    [receivables, receivable],
  );
  const isMulti = list.length > 1;
  const balance = list.reduce((s, r) => s + Number(r.balance || 0), 0);
  const nInterest = parseCurrencyInput(interest);
  const nFine = parseCurrencyInput(fine);
  const nDiscount = parseCurrencyInput(discount);
  const nSurcharge = parseCurrencyInput(surcharge);
  const toEffective = useMemo(
    () => Math.max(0, +(balance + nInterest + nFine + nSurcharge - nDiscount).toFixed(2)),
    [balance, nInterest, nFine, nSurcharge, nDiscount],
  );
  const totalPaid = paymentMethods.reduce(
    (s, m) => s + parseCurrencyInput(lines[m.id] || ''),
    0,
  );
  const diff = +(toEffective - totalPaid).toFixed(2);
  const remaining = Math.max(0, diff);
  const over = diff < -0.005;
  const exact = Math.abs(diff) < 0.005 && totalPaid > 0;

  // Detecta se alguma linha usa forma de pagamento TEF com valor > 0.
  // Nesse caso, a emissão da NFC-e é obrigatória (não pode desmarcar).
  const hasTefLine = paymentMethods.some(
    (m) =>
      (m.integrationType || '').toLowerCase() === 'tef' &&
      parseCurrencyInput(lines[m.id] || '') > 0,
  );
  const effectiveEmitNfce = hasTefLine ? true : emitNfce;

  useEffect(() => {
    if (open) {
      setInterest('0,00');
      setFine('0,00');
      setDiscount('0,00');
      setSurcharge('0,00');
      setLines({});
      setEmitNfce(false);
      setTimeout(() => {
        const first = paymentMethods[0];
        if (first) {
          const el = lineRefs.current[first.id];
          el?.focus();
          el?.select();
        }
      }, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateLine = (id: string, text: string) =>
    setLines((prev) => ({ ...prev, [id]: maskCurrencyInput(text) }));

  const fillRemainingOnLine = (id: string) => {
    const cur = parseCurrencyInput(lines[id] || '');
    const target = cur + remaining;
    if (target <= 0) return;
    setLines((prev) => ({
      ...prev,
      [id]: maskCurrencyInput(target.toFixed(2).replace('.', ',')),
    }));
  };

  const focusMethodByIndex = (idx: number) => {
    const m = paymentMethods[idx];
    if (!m) return;
    const el = lineRefs.current[m.id];
    el?.focus();
    el?.select();
  };

  const submit = async () => {
    if (!exact) return;
    const payments: EfetivarPayment[] = paymentMethods
      .map((m) => {
        const amt = parseCurrencyInput(lines[m.id] || '');
        if (amt <= 0) return null;
        return { amount: amt, paymentMethodId: m.id, paymentName: m.name };
      })
      .filter(Boolean) as EfetivarPayment[];
    if (payments.length === 0) return;
    await onConfirm({
      interest: nInterest,
      fine: nFine,
      discount: nDiscount,
      surcharge: nSurcharge,
      payments,
      emitNfce: effectiveEmitNfce,
    });
  };

  // Atalhos A..Z para focar formas de pagamento
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (busy) return;
      if (
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        e.key.length === 1 &&
        /[a-zA-Z]/.test(e.key)
      ) {
        const idx = LETTERS.indexOf(e.key.toUpperCase());
        if (idx >= 0 && idx < paymentMethods.length) {
          e.preventDefault();
          focusMethodByIndex(idx);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, paymentMethods]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onOpenChange(false)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Efetivar receita</DialogTitle>
        </DialogHeader>
        {list.length > 0 && (
          <div className="space-y-4">
            {/* Cabeçalho: Documento | A Efetivar | Juros | Multa | Desconto | Acréscimo */}
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2 font-normal">Documento</th>
                    <th className="text-right px-3 py-2 font-normal">A Efetivar</th>
                    <th className="text-right px-3 py-2 font-normal">Juros</th>
                    <th className="text-right px-3 py-2 font-normal">Multa</th>
                    <th className="text-right px-3 py-2 font-normal">Desconto</th>
                    <th className="text-right px-3 py-2 font-normal">Acréscimo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 text-primary font-medium">
                      {isMulti
                        ? `Múltiplas parcelas (${list.length})`
                        : list[0].document_number || list[0].id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{brl(toEffective)}</td>
                    <td className="px-1 py-1">
                      <Input
                        value={interest}
                        onChange={(e) => setInterest(maskCurrencyInput(e.target.value))}
                        className="h-8 text-right"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={fine}
                        onChange={(e) => setFine(maskCurrencyInput(e.target.value))}
                        className="h-8 text-right"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={discount}
                        onChange={(e) => setDiscount(maskCurrencyInput(e.target.value))}
                        className="h-8 text-right"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={surcharge}
                        onChange={(e) => setSurcharge(maskCurrencyInput(e.target.value))}
                        className="h-8 text-right"
                        inputMode="decimal"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Formas de pagamento com atalhos por letra (estilo Frente de Caixa) */}
            <div>
              {paymentMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Nenhuma forma de pagamento cadastrada.
                </p>
              ) : (
                <ul className="divide-y border-y">
                  {paymentMethods.map((m, idx) => {
                    const letter = LETTERS[idx] || '';
                    return (
                      <li key={m.id} className="py-2.5 flex items-center gap-3">
                        <span className="flex-1 flex items-center gap-2 text-sm">
                          <span>{m.name}</span>
                          {letter && (
                            <kbd className="ml-auto px-1.5 py-0.5 border border-border rounded text-[10px] bg-muted/40">
                              {letter}
                            </kbd>
                          )}
                        </span>
                        <Input
                          ref={(el) => (lineRefs.current[m.id] = el)}
                          value={lines[m.id] || ''}
                          onChange={(e) => updateLine(m.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const cur = parseCurrencyInput(lines[m.id] || '');
                              if (cur === 0 && remaining > 0) {
                                fillRemainingOnLine(m.id);
                                return;
                              }
                              if (exact && !busy) submit();
                            }
                          }}
                          placeholder="R$ 0,00"
                          inputMode="decimal"
                          disabled={busy}
                          className="w-40 text-right"
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex items-center justify-between pt-3 text-sm">
                <span className="text-muted-foreground">
                  Pagamentos: <strong>{brl(totalPaid)}</strong>
                </span>
                <span
                  className={
                    exact
                      ? 'text-emerald-500 font-semibold'
                      : 'text-destructive font-semibold'
                  }
                >
                  {over
                    ? `Excede: ${brl(totalPaid - toEffective)}`
                    : `Falta: ${brl(remaining)}`}
                </span>
              </div>

              {/* Emissão de NFC-e — obrigatória em TEF, opcional nas demais formas */}
              <div className="pt-3 border-t mt-3">
                <label
                  className={
                    'flex items-start gap-2 text-sm ' +
                    (hasTefLine ? 'opacity-90' : 'cursor-pointer')
                  }
                >
                  <Checkbox
                    checked={effectiveEmitNfce}
                    onCheckedChange={(v) => !hasTefLine && setEmitNfce(v === true)}
                    disabled={hasTefLine || busy}
                    className="mt-0.5"
                  />
                  <span>
                    Emitir NFC-e após efetivar
                    {hasTefLine && (
                      <span className="block text-[11px] text-muted-foreground">
                        Obrigatória para pagamentos via TEF — não pode ser desmarcada.
                      </span>
                    )}
                  </span>
                </label>
              </div>

              <p className="text-[11px] text-muted-foreground pt-2">
                <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">A–Z</kbd>{' '}
                foca a forma de pagamento.{' '}
                <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">Enter</kbd>{' '}
                preenche o restante e efetiva.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            CANCELAR
          </Button>
          <Button onClick={submit} disabled={busy || !exact}>
            EFETIVAR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}