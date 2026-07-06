/**
 * Diálogo "Renegociação de receitas" — replica o UX do Gweb.
 *
 * Cancela o título original e gera N novas parcelas com intervalo
 * configurável (dia/semana/mês). Prévia das parcelas em tempo real.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { brl, maskCurrencyInput, parseCurrencyInput } from '@/components/pdv-v2/_format';
import { cn } from '@/lib/utils';
import type { AccountReceivable } from '@/hooks/useAccountsReceivable';

type Period = 'day' | 'week' | 'month';

export interface RenegotiateSubmit {
  newTotalAmount: number;
  installments: Array<{ amount: number; dueDate: string }>;
}

function statusBadge(row: AccountReceivable, today: string) {
  if (row.status === 'paid') return { label: 'Paga', cls: 'bg-emerald-600 text-white' };
  if (row.status === 'canceled') return { label: 'Cancelada', cls: 'bg-muted-foreground/40' };
  if (Number(row.balance) < Number(row.amount)) return { label: 'Parcial', cls: 'bg-amber-500 text-white' };
  if (row.due_date < today) return { label: 'Atrasada', cls: 'bg-destructive text-destructive-foreground' };
  return { label: 'A vencer', cls: 'bg-sky-500 text-white' };
}

export function RenegociarReceitaDialog({
  open, onOpenChange, receivable, onConfirm, busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  receivable: AccountReceivable | null;
  onConfirm: (data: RenegotiateSubmit) => Promise<void> | void;
  busy: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const balance = Number(receivable?.balance || 0);

  const [totalStr, setTotalStr] = useState('0,00');
  const [numParcelas, setNumParcelas] = useState<number>(1);
  const [interval, setIntervalVal] = useState<number>(1);
  const [period, setPeriod] = useState<Period>('month');

  useEffect(() => {
    if (open && receivable) {
      setTotalStr(maskCurrencyInput(balance.toFixed(2).replace('.', ',')));
      setNumParcelas(1);
      setIntervalVal(1);
      setPeriod('month');
    }
  }, [open, receivable, balance]);

  const total = parseCurrencyInput(totalStr);

  const parcelas = useMemo(() => {
    const n = Math.max(1, numParcelas);
    const base = Math.floor((total * 100) / n) / 100;
    const remainder = Math.round((total - base * n) * 100) / 100;
    const start = new Date();
    const list: Array<{ number: number; amount: number; dueDate: string }> = [];
    for (let i = 0; i < n; i++) {
      const due = new Date(start);
      if (period === 'day') due.setDate(due.getDate() + interval * i);
      else if (period === 'week') due.setDate(due.getDate() + 7 * interval * i);
      else due.setMonth(due.getMonth() + interval * i);
      const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
      const amt = i === n - 1 ? +(base + remainder).toFixed(2) : base;
      list.push({ number: i + 1, amount: amt, dueDate: iso });
    }
    return list;
  }, [numParcelas, interval, period, total]);

  const submit = async () => {
    if (total <= 0 || parcelas.length === 0) return;
    await onConfirm({
      newTotalAmount: total,
      installments: parcelas.map((p) => ({ amount: p.amount, dueDate: p.dueDate })),
    });
  };

  if (!receivable) return null;
  const badge = statusBadge(receivable, today);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onOpenChange(false)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Renegociação de receitas</DialogTitle>
        </DialogHeader>

        {/* Cabeçalho tabular */}
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-normal">Documento</th>
                <th className="text-left px-3 py-2 font-normal">Vencimento</th>
                <th className="text-left px-3 py-2 font-normal">Situação</th>
                <th className="text-right px-3 py-2 font-normal">Valor</th>
                <th className="text-right px-3 py-2 font-normal">Restante</th>
                <th className="text-right px-3 py-2 font-normal">Recebido</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 text-primary font-medium">
                  {receivable.document_number || receivable.id.slice(0, 8).toUpperCase()}
                </td>
                <td className="px-3 py-2">{receivable.due_date.split('-').reverse().join('/')}</td>
                <td className="px-3 py-2"><Badge className={cn('rounded-full px-3', badge.cls)}>{badge.label}</Badge></td>
                <td className="px-3 py-2 text-right">{brl(Number(receivable.amount))}</td>
                <td className="px-3 py-2 text-right">{brl(Number(receivable.balance))}</td>
                <td className="px-3 py-2 text-right">{brl(Number(receivable.amount) - Number(receivable.balance))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Formulário */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Valor total</Label>
            <Input
              value={totalStr}
              onChange={(e) => setTotalStr(maskCurrencyInput(e.target.value))}
              inputMode="decimal"
              className="text-right"
            />
            <p className="text-[11px] text-muted-foreground">Valor total da renegociação</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Plano de contas</Label>
            <Input disabled placeholder="—" />
            <p className="text-[11px] text-muted-foreground">Em breve</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Centro de custos</Label>
            <Input disabled placeholder="—" />
            <p className="text-[11px] text-muted-foreground">Em breve</p>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Nº de parcelas</Label>
            <Input
              type="number" min={1} max={60}
              value={numParcelas}
              onChange={(e) => setNumParcelas(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Intervalo *</Label>
            <Input
              type="number" min={1}
              value={interval}
              onChange={(e) => setIntervalVal(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Período *</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Dia</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Prévia das parcelas */}
        <div className="rounded-md border">
          <div className="grid grid-cols-3 gap-2 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <div>Parcela</div>
            <div className="text-right">Valor</div>
            <div>Vencimento</div>
          </div>
          <div className="divide-y">
            {parcelas.map((p) => (
              <div key={p.number} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm">
                <div>{p.number}</div>
                <div className="text-right">{brl(p.amount)}</div>
                <div>{p.dueDate.split('-').reverse().join('/')}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Clique em <b>Gerar renegociação</b> para gerar novas receitas no valor de <b>{brl(total)}</b>.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>FECHAR</Button>
          <Button onClick={submit} disabled={busy || total <= 0}>
            GERAR RENEGOCIAÇÃO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}