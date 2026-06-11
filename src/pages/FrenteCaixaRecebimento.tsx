import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Filter, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { supabase } from '@/integrations/supabase/client';
import { brl } from '@/components/pdv-v2/_format';

type StatusFilter = 'all' | 'recebida' | 'cancelada' | 'pendente';

interface ReceitaRow {
  id: string;
  doc: string;        // Ex.: PV00000000000003 ou NFCE0050028491
  amount: number;
  emissao: string;    // ISO
  vencimento: string; // ISO (mesma data — recebida no ato)
  recebida: string | null; // ISO ou null
  customer: string | null;
  status: 'recebida' | 'cancelada' | 'pendente';
}

/**
 * Receitas (Entradas finalizadas e futuras) — equivalente ao Recebimento do Gweb.
 *
 * Fonte: `pdv_sales` (vendas internas do PDV) + `nfce_records` (NFC-e emitidas).
 * Cada venda PDV gera uma linha "PV…"; toda NFC-e autorizada gera uma linha "NFCE…".
 * Como nosso fluxo é "recebida no ato", emissão = vencimento = recebida.
 *
 * Inspirado no print do Gweb anexado pelo cliente.
 */
export default function FrenteCaixaRecebimento() {
  const navigate = useNavigate();
  const { company } = useAuthContext();
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);

  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [docFilter, setDocFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [rows, setRows] = useState<ReceitaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!company?.id) return;
    setRefreshing(true);
    try {
      const fromISO = new Date(dateFrom + 'T00:00:00').toISOString();
      const toISO = new Date(dateTo + 'T23:59:59').toISOString();

      const [{ data: sales, error: salesErr }, { data: nfces, error: nfceErr }] = await Promise.all([
        supabase
          .from('pdv_sales')
          .select('id, final_total, customer_name, notes, created_at')
          .eq('company_id', company.id)
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('nfce_records')
          .select('id, numero, serie, status, valor_total, destinatario_nome, created_at')
          .eq('company_id', company.id)
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false })
          .limit(1000),
      ]);
      if (salesErr) throw salesErr;
      if (nfceErr) throw nfceErr;

      const saleRows: ReceitaRow[] = (sales || []).map((s: any) => {
        const cancelled = !!s.notes?.includes('[CANCELADA]');
        return {
          id: 's-' + s.id,
          doc: 'PV' + String(s.id).replace(/-/g, '').slice(0, 12).toUpperCase(),
          amount: Number(s.final_total) || 0,
          emissao: s.created_at,
          vencimento: s.created_at,
          recebida: cancelled ? null : s.created_at,
          customer: s.customer_name || null,
          status: cancelled ? 'cancelada' : 'recebida',
        };
      });

      const nfceRows: ReceitaRow[] = (nfces || []).map((n: any) => {
        const isCancelled = n.status === 'cancelada';
        const isAuthorized = n.status === 'autorizada';
        const numero = (n.numero || '0').toString().padStart(9, '0');
        const serie = (n.serie || '0').toString().padStart(3, '0');
        return {
          id: 'n-' + n.id,
          doc: `NFCE${serie}${numero}`,
          amount: Number(n.valor_total) || 0,
          emissao: n.created_at,
          vencimento: n.created_at,
          recebida: isAuthorized ? n.created_at : null,
          customer: n.destinatario_nome || null,
          status: isCancelled ? 'cancelada' : isAuthorized ? 'recebida' : 'pendente',
        };
      });

      const merged = [...saleRows, ...nfceRows].sort(
        (a, b) => new Date(b.emissao).getTime() - new Date(a.emissao).getTime(),
      );
      setRows(merged);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar receitas: ' + (e.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (docFilter.trim()) {
        const list = docFilter.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
        if (!list.some((d) => r.doc.toLowerCase().includes(d))) return false;
      }
      if (customerFilter.trim()) {
        if (!(r.customer || '').toLowerCase().includes(customerFilter.toLowerCase())) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = [r.doc, r.customer, r.amount.toFixed(2)].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, docFilter, customerFilter, search]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      sum: filtered.reduce((s, r) => s + r.amount, 0),
    }),
    [filtered],
  );

  if (mercadoLoading) {
    return (
      <PDVV2Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PDVV2Layout>
    );
  }
  if (!mercadoEnabled) return <Navigate to="/pdv-v2" replace />;

  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    try { return format(new Date(iso), 'dd/MM/yyyy'); } catch { return '—'; }
  }

  const statusBadge: Record<ReceitaRow['status'], { label: string; className: string }> = {
    recebida: { label: 'Recebida', className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
    pendente: { label: 'Pendente', className: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
    cancelada: { label: 'Cancelada', className: 'bg-muted text-muted-foreground border-border' },
  };

  return (
    <PDVV2Layout>
      <div className="h-full flex flex-col bg-background">
        <div className="border-b px-4 py-2 flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/frente-caixa')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="font-semibold leading-tight">Receitas</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">Entradas finalizadas e futuras</p>
            </div>
            <Badge variant="outline">Frente de Caixa</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar
          </Button>
        </div>

        {/* Busca + toggle de filtros */}
        <div className="border-b px-4 py-3 bg-muted/30 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[240px] space-y-1">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Digite para buscar..."
                className="h-9 pl-8"
              />
            </div>
          </div>
          <Button
            size="sm"
            variant={showFilters ? 'default' : 'outline'}
            onClick={() => setShowFilters((s) => !s)}
            title="Filtrar"
          >
            <Filter className="h-4 w-4 mr-1" /> Filtrar
          </Button>
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">{totals.count} receita(s)</p>
            <p className="text-lg font-bold tabular-nums text-emerald-600">{brl(totals.sum)}</p>
          </div>
        </div>

        {showFilters && (
          <div className="border-b px-4 py-3 bg-card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cliente</label>
              <Input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="recebida">Recebida</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Emissão inicial</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Emissão final</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground">Nº do documento</label>
              <Input
                value={docFilter}
                onChange={(e) => setDocFilter(e.target.value)}
                placeholder="Separe múltiplos documentos por vírgula"
                className="h-9"
              />
            </div>
          </div>
        )}

        {/* Lista */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma receita no período selecionado.
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => {
                const cfg = statusBadge[r.status];
                return (
                  <li key={r.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">Doc.: {r.doc}</span>
                        <span className="text-muted-foreground"> | </span>
                        <span>Valor: <span className="font-semibold text-emerald-600 tabular-nums">{brl(r.amount)}</span></span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Emitida em {fmtDate(r.emissao)} | Vence em {fmtDate(r.vencimento)} | Recebida em: {fmtDate(r.recebida)}
                        {r.customer ? ` | ${r.customer}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className={`${cfg.className} text-[11px]`}>
                      {cfg.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </div>
    </PDVV2Layout>
  );
}