import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { useResellerPortal } from '@/hooks/useResellerPortal';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, Store, Ban, Lock, TrendingUp, DollarSign, Eye, EyeOff, Plus, ImageIcon,
  Calendar, AlertTriangle, ArrowUpRight, TrendingDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface OpenInvoice {
  id: string;
  company_id: string;
  due_date: string;
  total_value: number;
  status: string;
  month: string;
}

const BRL = (n: number) =>
  `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export default function ResellerHome() {
  const navigate = useNavigate();
  const { reseller, companies, settings, stats, loading } = useResellerPortal();
  const [showMRR, setShowMRR] = useState(true);

  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [paidHistory, setPaidHistory] = useState<{ month: string; total: number }[]>([]);
  const [activations30d, setActivations30d] = useState(0);
  const [churn30d, setChurn30d] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  const [dueListOpen, setDueListOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => {
    if (!reseller) return;
    (async () => {
      setLoadingData(true);
      const now = new Date();
      const last30 = new Date(now.getTime() - 30 * 86400000);

      const companyIds = companies.map(c => c.id);

      const [invRes, activationsRes, churnRes, paidRes] = await Promise.all([
        supabase
          .from('reseller_invoices')
          .select('id, company_id, due_date, total_value, status, month')
          .eq('reseller_id', reseller.id)
          .not('status', 'in', '(paid,canceled)')
          .order('due_date', { ascending: true }),
        companyIds.length
          ? supabase
              .from('company_plans')
              .select('company_id, activated_at')
              .in('company_id', companyIds)
              .gte('activated_at', last30.toISOString())
          : Promise.resolve({ data: [] as any[], error: null } as any),
        companyIds.length
          ? supabase
              .from('companies')
              .select('id, license_canceled_at')
              .in('id', companyIds)
              .not('license_canceled_at', 'is', null)
              .gte('license_canceled_at', last30.toISOString())
          : Promise.resolve({ data: [] as any[], error: null } as any),
        supabase
          .from('reseller_invoices')
          .select('total_value, paid_at')
          .eq('reseller_id', reseller.id)
          .eq('status', 'paid')
          .not('paid_at', 'is', null)
          .gte('paid_at', new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()),
      ]);

      setInvoices((invRes.data || []) as OpenInvoice[]);
      setActivations30d((activationsRes.data || []).length);
      setChurn30d((churnRes.data || []).length);

      // Agrupa MRR pago por mês (últimos 6)
      const buckets: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets[format(d, 'yyyy-MM')] = 0;
      }
      (paidRes.data || []).forEach((r: any) => {
        const key = format(new Date(r.paid_at), 'yyyy-MM');
        if (key in buckets) buckets[key] += Number(r.total_value) || 0;
      });
      setPaidHistory(Object.entries(buckets).map(([month, total]) => ({ month, total })));

      setLoadingData(false);
    })();
  }, [reseller, companies]);

  // Cards
  const cards = useMemo(() => {
    const active = companies.filter(c => c.active && (c.license_status || 'active') === 'active').length;
    const blocked = companies.filter(c =>
      ['blocked', 'canceled'].includes((c.license_status || 'active').toLowerCase()),
    ).length;
    // Trava da revenda = auto-suspensão por inadimplência: active=false mas license_status ainda 'active'
    const trava = companies.filter(c => !c.active && (c.license_status || 'active') === 'active').length;
    return { active, blocked, trava };
  }, [companies]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dueSoon = useMemo(() => {
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 7);
    return invoices.filter(i => {
      const due = new Date(i.due_date + 'T12:00:00');
      return due >= today && due <= limit;
    });
  }, [invoices, today]);

  const overdueSevere = useMemo(() => {
    return invoices.filter(i => {
      const due = new Date(i.due_date + 'T12:00:00');
      const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
      return days > 15;
    });
  }, [invoices, today]);

  const ticketMedio = cards.active > 0 ? stats.mrr / cards.active : 0;

  const maxSpark = Math.max(1, ...paidHistory.map(p => p.total));
  const currentMonth = format(new Date(), 'yyyy-MM');

  const dueSoonTotal = dueSoon.reduce((s, i) => s + Number(i.total_value), 0);
  const selectedTotal = dueSoon
    .filter(i => selectedInvoices.has(i.id))
    .reduce((s, i) => s + Number(i.total_value), 0);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    companies.forEach(c => m.set(c.id, c.name));
    return m;
  }, [companies]);

  async function markSelectedPaid() {
    if (selectedInvoices.size === 0) return;
    setMarkingPaid(true);
    try {
      const ids = Array.from(selectedInvoices);
      const { error } = await supabase
        .from('reseller_invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} fatura(s) marcada(s) como paga(s)`);
      setInvoices(prev => prev.filter(i => !selectedInvoices.has(i.id)));
      setSelectedInvoices(new Set());
    } catch (e: any) {
      toast.error('Erro ao marcar como pago: ' + (e?.message || 'desconhecido'));
    } finally {
      setMarkingPaid(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ResellerLayout title="Home">
      <div className="space-y-6">
        {/* Alerta de inadimplência grave */}
        {overdueSevere.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <span className="text-destructive font-medium">
              {overdueSevere.length} loja(s) com fatura vencida há mais de 15 dias.
            </span>
          </div>
        )}

        {/* Linha 1 — Saúde da carteira */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Lojas ativas</CardTitle>
              <Store className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{cards.active}</div>
              <p className="text-xs text-muted-foreground">sem trava, licença ativa</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Bloqueadas</CardTitle>
              <Ban className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{cards.blocked}</div>
              <p className="text-xs text-muted-foreground">bloqueio manual / cancelada</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Trava da revenda</CardTitle>
              <Lock className="w-4 h-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{cards.trava}</div>
              <p className="text-xs text-muted-foreground">suspensa por inadimplência</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Ativações (30d)</CardTitle>
              <TrendingUp className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{activations30d}</div>
              <p className="text-xs text-muted-foreground">novas lojas nos últimos 30 dias</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Churn (30d)</CardTitle>
              <TrendingDown className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{churn30d}</div>
              <p className="text-xs text-muted-foreground">lojas canceladas nos últimos 30 dias</p>
            </CardContent>
          </Card>
        </section>

        {/* Linha 2 — Financeiro operacional */}
        <section className="grid grid-cols-1 gap-4">
          {/* A vencer 7 dias */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">A vencer nos próximos 7 dias</CardTitle>
              <Calendar className="w-4 h-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{dueSoon.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Total: <span className="font-medium text-foreground">{BRL(dueSoonTotal)}</span>
                  </p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  disabled={loadingData || dueSoon.length === 0}
                  onClick={() => { setSelectedInvoices(new Set()); setDueListOpen(true); }}
                >
                  Ver lista
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Vencidas +15d: {overdueSevere.length}</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Linha 3 — Ações rápidas */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/revendedor/lojas?novo=1')}
            className="group flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition p-5 text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold">Ativar nova loja</p>
              <p className="text-xs text-muted-foreground">Cadastrar um novo cliente e emitir a fatura de ativação</p>
            </div>
            <ArrowUpRight className="w-4 h-4 ml-auto text-muted-foreground group-hover:text-primary" />
          </button>

          <button
            onClick={() => navigate('/revendedor/midia-kit')}
            className="group flex items-center gap-4 rounded-lg border bg-card hover:bg-muted/40 transition p-5 text-left"
          >
            <div className="w-12 h-12 rounded-lg bg-muted grid place-items-center">
              <ImageIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold">Mídia Kit</p>
              <p className="text-xs text-muted-foreground">Materiais de venda e apresentação</p>
            </div>
            <ArrowUpRight className="w-4 h-4 ml-auto text-muted-foreground group-hover:text-foreground" />
          </button>
        </section>
      </div>

      {/* Diálogo — A vencer 7 dias */}
      <Dialog open={dueListOpen} onOpenChange={setDueListOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mensalidades a vencer — próximos 7 dias</DialogTitle>
          </DialogHeader>
          {dueSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma fatura a vencer neste período.</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="w-10 p-2">
                      <Checkbox
                        checked={selectedInvoices.size === dueSoon.length && dueSoon.length > 0}
                        onCheckedChange={(v) => {
                          if (v) setSelectedInvoices(new Set(dueSoon.map(i => i.id)));
                          else setSelectedInvoices(new Set());
                        }}
                      />
                    </th>
                    <th className="p-2">Loja</th>
                    <th className="p-2">Vencimento</th>
                    <th className="p-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {dueSoon.map(inv => {
                    const due = new Date(inv.due_date + 'T12:00:00');
                    const days = Math.floor((due.getTime() - today.getTime()) / 86400000);
                    return (
                      <tr key={inv.id} className="border-t hover:bg-muted/30">
                        <td className="p-2">
                          <Checkbox
                            checked={selectedInvoices.has(inv.id)}
                            onCheckedChange={(v) => {
                              const next = new Set(selectedInvoices);
                              if (v) next.add(inv.id); else next.delete(inv.id);
                              setSelectedInvoices(next);
                            }}
                          />
                        </td>
                        <td className="p-2 font-medium">{nameById.get(inv.company_id) || '—'}</td>
                        <td className="p-2">
                          {format(due, 'dd/MM/yyyy', { locale: ptBR })}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days}d`}
                          </span>
                        </td>
                        <td className="p-2 text-right font-medium text-green-600">{BRL(Number(inv.total_value))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter className="items-center justify-between sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedInvoices.size > 0 && (
                <>Selecionadas: <span className="font-medium text-foreground">{selectedInvoices.size}</span> · Total <span className="font-medium text-green-600">{BRL(selectedTotal)}</span></>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDueListOpen(false)}>Fechar</Button>
              <Button
                onClick={markSelectedPaid}
                disabled={selectedInvoices.size === 0 || markingPaid}
              >
                {markingPaid && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Marcar como pago
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ResellerLayout>
  );
}
