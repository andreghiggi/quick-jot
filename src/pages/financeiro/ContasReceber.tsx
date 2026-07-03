import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, CircleDollarSign, XCircle, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useAuthContext } from '@/contexts/AuthContext';
import { useFinanceiroEnabled } from '@/hooks/useFinanceiroEnabled';
import { useAccountsReceivable, type AccountReceivable, type ARStatus } from '@/hooks/useAccountsReceivable';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { brl, maskCurrencyInput, parseCurrencyInput } from '@/components/pdv-v2/_format';

/**
 * Contas a Receber — módulo Financeiro (Fase 1: Crediário).
 *
 * Lista os títulos gerados pelo crediário na Frente de Caixa e permite
 * receber (baixa parcial ou total) e cancelar títulos.
 *
 * Isolado: não altera Caixa, Frente de Caixa, PDV V2, Pedido Express,
 * TEF, NFC-e nem impressão.
 */
export default function ContasReceber() {
  const navigate = useNavigate();
  const { user, company } = useAuthContext();
  const { enabled: finEnabled, loading: finLoading } = useFinanceiroEnabled(company?.id);
  const { items, loading, receivePayment, cancel } = useAccountsReceivable(company?.id);
  const { activePaymentMethods } = usePaymentMethods({ companyId: company?.id, channel: 'pdv' });

  const [tab, setTab] = useState<ARStatus | 'overdue'>('open');
  const [receiveTarget, setReceiveTarget] = useState<AccountReceivable | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AccountReceivable | null>(null);
  const [receiveText, setReceiveText] = useState('');
  const [receivePayment_MethodId, setReceivePayment_MethodId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const buckets = useMemo(() => {
    const open = items.filter((i) => i.status === 'open');
    const overdue = open.filter((i) => i.due_date < today);
    const paid = items.filter((i) => i.status === 'paid');
    const canceled = items.filter((i) => i.status === 'canceled');
    return { open, overdue, paid, canceled };
  }, [items, today]);

  const list = tab === 'overdue'
    ? buckets.overdue
    : tab === 'open'
      ? buckets.open
      : tab === 'paid'
        ? buckets.paid
        : buckets.canceled;

  const openReceive = (r: AccountReceivable) => {
    setReceiveTarget(r);
    setReceiveText(maskCurrencyInput(Number(r.balance).toFixed(2).replace('.', ',')));
    setReceivePayment_MethodId('');
  };

  const confirmReceive = async () => {
    if (!receiveTarget || !company?.id) return;
    const amount = parseCurrencyInput(receiveText);
    if (amount <= 0) return;
    const selected = activePaymentMethods.find((m) => m.id === receivePayment_MethodId);
    setBusy(true);
    const ok = await receivePayment({
      receivableId: receiveTarget.id,
      companyId: company.id,
      amount,
      paymentMethodId: selected?.id ?? null,
      paymentName: selected?.name || 'Dinheiro',
      operatorId: user?.id ?? null,
    });
    setBusy(false);
    if (ok) setReceiveTarget(null);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    const ok = await cancel(cancelTarget.id, undefined, user?.id);
    setBusy(false);
    if (ok) setCancelTarget(null);
  };

  if (finLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!finEnabled) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Contas a Receber</h1>
          <p className="text-sm text-muted-foreground">
            Títulos de crediário gerados pela Frente de Caixa. Receba baixas totais ou parciais.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Em aberto" value={buckets.open.reduce((s, i) => s + Number(i.balance), 0)} count={buckets.open.length} tone="default" />
        <SummaryCard label="Vencidos" value={buckets.overdue.reduce((s, i) => s + Number(i.balance), 0)} count={buckets.overdue.length} tone="destructive" />
        <SummaryCard label="Recebidos" value={buckets.paid.reduce((s, i) => s + Number(i.amount), 0)} count={buckets.paid.length} tone="success" />
        <SummaryCard label="Cancelados" value={buckets.canceled.reduce((s, i) => s + Number(i.amount), 0)} count={buckets.canceled.length} tone="muted" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="open">Em aberto ({buckets.open.length})</TabsTrigger>
          <TabsTrigger value="overdue">Vencidos ({buckets.overdue.length})</TabsTrigger>
          <TabsTrigger value="paid">Pagos ({buckets.paid.length})</TabsTrigger>
          <TabsTrigger value="canceled">Cancelados ({buckets.canceled.length})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum título nesta categoria.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {list.map((r) => (
                <ReceivableRow
                  key={r.id}
                  r={r}
                  today={today}
                  onReceive={() => openReceive(r)}
                  onCancel={() => setCancelTarget(r)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Diálogo: Receber */}
      <Dialog open={!!receiveTarget} onOpenChange={(o) => !o && !busy && setReceiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber crediário</DialogTitle>
            <DialogDescription>
              {receiveTarget && `${receiveTarget.customer_name} — saldo devedor ${brl(Number(receiveTarget.balance))}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Valor recebido (R$)</Label>
              <Input
                value={receiveText}
                onChange={(e) => setReceiveText(maskCurrencyInput(e.target.value))}
                inputMode="decimal"
                placeholder="R$ 0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de recebimento</Label>
              <Select value={receivePayment_MethodId} onValueChange={setReceivePayment_MethodId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activePaymentMethods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiveTarget(null)} disabled={busy}>Voltar</Button>
            <Button onClick={confirmReceive} disabled={busy || !receivePayment_MethodId}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: Cancelar */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && !busy && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar título</DialogTitle>
            <DialogDescription>
              {cancelTarget && `Confirma o cancelamento do título de ${cancelTarget.customer_name} (${brl(Number(cancelTarget.balance))})? Essa ação não pode ser desfeita.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)} disabled={busy}>Voltar</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Cancelar título
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value, count, tone }: { label: string; value: number; count: number; tone: 'default' | 'destructive' | 'success' | 'muted' }) {
  const toneClass =
    tone === 'destructive' ? 'text-destructive' :
    tone === 'success'     ? 'text-emerald-500' :
    tone === 'muted'       ? 'text-muted-foreground' :
                             'text-foreground';
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{brl(value)}</div>
        <div className="text-[11px] text-muted-foreground">{count} título(s)</div>
      </CardContent>
    </Card>
  );
}

function ReceivableRow({
  r, today, onReceive, onCancel,
}: {
  r: AccountReceivable;
  today: string;
  onReceive: () => void;
  onCancel: () => void;
}) {
  const overdue = r.status === 'open' && r.due_date < today;
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{r.customer_name}</span>
            {r.customer_phone && <span className="text-xs text-muted-foreground">· {r.customer_phone}</span>}
            {overdue && <Badge variant="destructive" className="text-[10px]">VENCIDO</Badge>}
            {r.status === 'paid' && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">PAGO</Badge>}
            {r.status === 'canceled' && <Badge variant="outline" className="text-[10px]">CANCELADO</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            Emitido {r.issue_date.split('-').reverse().join('/')} · Vence {r.due_date.split('-').reverse().join('/')}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Valor</div>
          <div className="tabular-nums">{brl(Number(r.amount))}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Saldo</div>
          <div className={`tabular-nums font-semibold ${overdue ? 'text-destructive' : ''}`}>{brl(Number(r.balance))}</div>
        </div>
        {r.status === 'open' && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onReceive} className="gap-1">
              <CircleDollarSign className="h-4 w-4" /> Receber
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} className="gap-1">
              <XCircle className="h-4 w-4" /> Cancelar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}