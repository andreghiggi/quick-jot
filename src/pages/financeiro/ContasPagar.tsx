import { useMemo, useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, CheckCircle2, XCircle, CircleDollarSign } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useAuthContext } from '@/contexts/AuthContext';
import { useFinanceiroEnabled } from '@/hooks/useFinanceiroEnabled';
import { useAccountsPayable, type AccountPayable, type APStatus } from '@/hooks/useAccountsPayable';
import { supabase } from '@/integrations/supabase/client';
import { brl, maskCurrencyInput, parseCurrencyInput } from '@/components/pdv-v2/_format';

interface SupplierOption { id: string; name: string; }

const PAYMENT_METHODS = ['Dinheiro', 'PIX', 'Transferência', 'Cartão de Débito', 'Cartão de Crédito', 'Boleto', 'Outro'];
const CATEGORIES = ['Fornecedor', 'Aluguel', 'Energia', 'Água', 'Internet', 'Salários', 'Impostos', 'Manutenção', 'Marketing', 'Outros'];

export default function ContasPagar() {
  const navigate = useNavigate();
  const { user, company } = useAuthContext();
  const { enabled: finEnabled, loading: finLoading } = useFinanceiroEnabled(company?.id);
  const { items, loading, create, pay, cancel } = useAccountsPayable(company?.id);

  const [tab, setTab] = useState<'open' | 'overdue' | 'paid' | 'canceled'>('open');
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<AccountPayable | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AccountPayable | null>(null);
  const [busy, setBusy] = useState(false);

  // Novo título
  const [nDesc, setNDesc] = useState('');
  const [nAmount, setNAmount] = useState('');
  const [nDue, setNDue] = useState<string>(new Date().toISOString().slice(0, 10));
  const [nCategory, setNCategory] = useState<string>('Outros');
  const [nSupplier, setNSupplier] = useState<string>('none');
  const [nNotes, setNNotes] = useState('');

  // Pagamento
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState<string>('Dinheiro');

  useEffect(() => {
    if (!company?.id) return;
    (supabase.from('suppliers') as any)
      .select('id, name')
      .eq('company_id', company.id)
      .eq('active', true)
      .order('name')
      .then(({ data }: any) => setSuppliers((data as any[]) ?? []));
  }, [company?.id]);

  const today = new Date().toISOString().slice(0, 10);

  const buckets = useMemo(() => {
    const open = items.filter((i) => i.status === 'open' || i.status === 'partial');
    const overdue = open.filter((i) => i.due_date < today);
    const paid = items.filter((i) => i.status === 'paid');
    const canceled = items.filter((i) => i.status === 'canceled');
    return { open, overdue, paid, canceled };
  }, [items, today]);

  const list =
    tab === 'overdue' ? buckets.overdue :
    tab === 'open' ? buckets.open :
    tab === 'paid' ? buckets.paid : buckets.canceled;

  const openCreate = () => {
    setNDesc(''); setNAmount(''); setNDue(today);
    setNCategory('Outros'); setNSupplier('none'); setNNotes('');
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!company?.id) return;
    const amount = parseCurrencyInput(nAmount);
    if (!nDesc.trim() || amount <= 0 || !nDue) return;
    setBusy(true);
    const id = await create({
      companyId: company.id,
      description: nDesc.trim(),
      amount,
      dueDate: nDue,
      category: nCategory,
      supplierId: nSupplier === 'none' ? null : nSupplier,
      notes: nNotes.trim() || null,
      createdBy: user?.id ?? null,
    });
    setBusy(false);
    if (id) setCreateOpen(false);
  };

  const openPay = (p: AccountPayable) => {
    setPayTarget(p);
    setPayAmt(maskCurrencyInput(Number(p.balance).toFixed(2).replace('.', ',')));
    setPayMethod('Dinheiro');
  };

  const submitPay = async () => {
    if (!payTarget || !company?.id) return;
    const amount = parseCurrencyInput(payAmt);
    if (amount <= 0) return;
    setBusy(true);
    const ok = await pay({
      payableId: payTarget.id,
      companyId: company.id,
      amount,
      paymentMethod: payMethod,
      createdBy: user?.id ?? null,
    });
    setBusy(false);
    if (ok) setPayTarget(null);
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    const ok = await cancel(cancelTarget.id, undefined, user?.id);
    setBusy(false);
    if (ok) setCancelTarget(null);
  };

  if (finLoading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!finEnabled) return <Navigate to="/" replace />;

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Contas a Pagar</h1>
          <p className="text-sm text-muted-foreground">Cadastre despesas e registre pagamentos parciais ou totais.</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Novo título</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Em aberto" value={buckets.open.reduce((s, i) => s + Number(i.balance), 0)} count={buckets.open.length} tone="default" />
        <SummaryCard label="Vencidos"  value={buckets.overdue.reduce((s, i) => s + Number(i.balance), 0)} count={buckets.overdue.length} tone="destructive" />
        <SummaryCard label="Pagos"     value={buckets.paid.reduce((s, i) => s + Number(i.amount), 0)} count={buckets.paid.length} tone="success" />
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
            <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : list.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum título nesta categoria.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {list.map((p) => (
                <PayableRow
                  key={p.id}
                  p={p}
                  today={today}
                  supplierName={suppliers.find((s) => s.id === p.supplier_id)?.name}
                  onPay={() => openPay(p)}
                  onCancel={() => setCancelTarget(p)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Novo título */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && !busy && setCreateOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo título a pagar</DialogTitle>
            <DialogDescription>Cadastre uma despesa. Você poderá quitar depois em pagamentos parciais ou totais.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Descrição</Label>
              <Input value={nDesc} onChange={(e) => setNDesc(e.target.value)} placeholder="Ex.: Aluguel março" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Valor</Label>
                <Input value={nAmount} onChange={(e) => setNAmount(maskCurrencyInput(e.target.value))} inputMode="decimal" placeholder="R$ 0,00" />
              </div>
              <div className="grid gap-1.5"><Label>Vencimento</Label>
                <Input type="date" value={nDue} onChange={(e) => setNDue(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Categoria</Label>
                <Select value={nCategory} onValueChange={setNCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Fornecedor (opcional)</Label>
                <Select value={nSupplier} onValueChange={setNSupplier}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5"><Label>Observações</Label>
              <Textarea value={nNotes} onChange={(e) => setNNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={submitCreate} disabled={busy || !nDesc.trim() || parseCurrencyInput(nAmount) <= 0 || !nDue}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Criar título
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagar */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && !busy && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar título</DialogTitle>
            <DialogDescription>
              {payTarget && `${payTarget.description} — saldo devedor ${brl(Number(payTarget.balance))}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Valor pago (R$)</Label>
              <Input value={payAmt} onChange={(e) => setPayAmt(maskCurrencyInput(e.target.value))} inputMode="decimal" placeholder="R$ 0,00" />
            </div>
            <div className="space-y-1.5"><Label>Forma de pagamento</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayTarget(null)} disabled={busy}>Voltar</Button>
            <Button onClick={submitPay} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && !busy && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar título</DialogTitle>
            <DialogDescription>
              {cancelTarget && `Confirma o cancelamento de "${cancelTarget.description}" (${brl(Number(cancelTarget.balance))})? Essa ação não pode ser desfeita.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)} disabled={busy}>Voltar</Button>
            <Button variant="destructive" onClick={submitCancel} disabled={busy}>
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
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
      <CardContent className="space-y-0.5">
        <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{brl(value)}</div>
        <div className="text-[11px] text-muted-foreground">{count} título(s)</div>
      </CardContent>
    </Card>
  );
}

function PayableRow({
  p, today, supplierName, onPay, onCancel,
}: {
  p: AccountPayable;
  today: string;
  supplierName?: string;
  onPay: () => void;
  onCancel: () => void;
}) {
  const active = p.status === 'open' || p.status === 'partial';
  const overdue = active && p.due_date < today;
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{p.description}</span>
            {p.category && <Badge variant="outline" className="text-[10px]">{p.category}</Badge>}
            {supplierName && <span className="text-xs text-muted-foreground">· {supplierName}</span>}
            {overdue && <Badge variant="destructive" className="text-[10px]">VENCIDO</Badge>}
            {p.status === 'partial' && <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500">PARCIAL</Badge>}
            {p.status === 'paid' && <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">PAGO</Badge>}
            {p.status === 'canceled' && <Badge variant="outline" className="text-[10px]">CANCELADO</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            Emitido {p.issue_date.split('-').reverse().join('/')} · Vence {p.due_date.split('-').reverse().join('/')}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Valor</div>
          <div className="tabular-nums">{brl(Number(p.amount))}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Saldo</div>
          <div className={`tabular-nums font-semibold ${overdue ? 'text-destructive' : ''}`}>{brl(Number(p.balance))}</div>
        </div>
        {active && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onPay} className="gap-1"><CircleDollarSign className="h-4 w-4" /> Pagar</Button>
            <Button size="sm" variant="outline" onClick={onCancel} className="gap-1"><XCircle className="h-4 w-4" /> Cancelar</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}