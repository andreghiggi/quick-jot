/**
 * Diálogo "Efetivar receita" — replica o UX do Gweb.
 *
 * Aplica-se a 1 parcela por vez. Permite split de pagamento (várias
 * formas somando o total). Contempla juros/multa/desconto/acréscimo no
 * cálculo do "Falta".
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
}

export function EfetivarReceitaDialog({
  open, onOpenChange, receivable, receivables, paymentMethods, onConfirm, busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  receivable: AccountReceivable | null;
  /** Quando informado, efetiva várias parcelas juntas (venda inteira). */
  receivables?: AccountReceivable[] | null;
  paymentMethods: Array<{ id: string; name: string }>;
  onConfirm: (data: EfetivarSubmit) => Promise<void> | void;
  busy: boolean;
}) {
  const [interest, setInterest] = useState('0,00');
  const [fine, setFine] = useState('0,00');
  const [discount, setDiscount] = useState('0,00');
  const [surcharge, setSurcharge] = useState('0,00');
  const [methodId, setMethodId] = useState('');
  const [amount, setAmount] = useState('0,00');
  const [payments, setPayments] = useState<EfetivarPayment[]>([]);

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
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const missing = Math.max(0, +(toEffective - totalPaid).toFixed(2));

  useEffect(() => {
    if (open) {
      setInterest('0,00'); setFine('0,00'); setDiscount('0,00'); setSurcharge('0,00');
      setMethodId(''); setAmount(maskCurrencyInput(balance.toFixed(2).replace('.', ',')));
      setPayments([]);
    }
  }, [open, balance]);

  const addPayment = () => {
    const amt = parseCurrencyInput(amount);
    if (amt <= 0) return;
    const m = paymentMethods.find((x) => x.id === methodId);
    setPayments((prev) => [
      ...prev,
      { amount: amt, paymentMethodId: m?.id ?? null, paymentName: m?.name || 'Dinheiro' },
    ]);
    const remaining = Math.max(0, +(missing - amt).toFixed(2));
    setAmount(maskCurrencyInput(remaining.toFixed(2).replace('.', ',')));
    setMethodId('');
  };

  const removePayment = (idx: number) => setPayments((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (payments.length === 0 || missing > 0.005) return;
    await onConfirm({
      interest: nInterest, fine: nFine, discount: nDiscount, surcharge: nSurcharge, payments,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onOpenChange(false)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Efetivar receita</DialogTitle>
        </DialogHeader>
        {list.length > 0 && (
          <div className="space-y-4">
            {/* Tabela de cabeçalho: Documento | A Efetivar | Juros | Multa | Desconto | Acréscimo */}
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
                        : (list[0].document_number || list[0].id.slice(0, 8).toUpperCase())}
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

            {/* Split de pagamento */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Meio de pagamento *</Label>
                  <Select value={methodId} onValueChange={setMethodId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Valor *</Label>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(maskCurrencyInput(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addPayment();
                      }
                    }}
                    inputMode="decimal"
                    className="text-right"
                  />
                </div>
                <Button
                  variant="ghost"
                  className="w-full text-primary hover:text-primary"
                  onClick={addPayment}
                  disabled={!methodId || parseCurrencyInput(amount) <= 0}
                >
                  <Plus className="h-4 w-4 mr-1" /> PRÓXIMO
                </Button>
                <div className="grid gap-1.5 pt-2 border-t">
                  <Label className="text-xs">Conta</Label>
                  <Select disabled value="default">
                    <SelectTrigger><SelectValue placeholder="Conta padrão" /></SelectTrigger>
                    <SelectContent><SelectItem value="default">Conta padrão</SelectItem></SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Será registrado na conta padrão</p>
                </div>
              </div>
              <div className="space-y-2">
                {payments.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-right">Nenhum pagamento informado</div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {payments.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 p-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.paymentName}</div>
                          <div className="text-xs text-muted-foreground">{brl(p.amount)}</div>
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removePayment(i)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-right text-sm pt-2 border-t space-y-0.5">
                  <div>Total: <b>{brl(totalPaid)}</b></div>
                  <div className={missing > 0.005 ? 'text-destructive' : 'text-emerald-500'}>
                    Falta: <b>{brl(missing)}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>CANCELAR</Button>
          <Button onClick={submit} disabled={busy || payments.length === 0 || missing > 0.005}>
            EFETIVAR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}