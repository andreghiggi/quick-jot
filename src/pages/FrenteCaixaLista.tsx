import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  AlertTriangle,
  FileMinus,
  Loader2,
  Search,
  Printer,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { supabase } from '@/integrations/supabase/client';
import { brl } from '@/components/pdv-v2/_format';
import { printDanfeFromRecord } from '@/services/nfceService';

interface SaleRow {
  id: string;
  created_at: string;
  final_total: number;
  discount: number;
  customer_name: string | null;
  notes: string | null;
  payment_method?: { name: string } | null;
  nfce?: {
    id: string;
    status: string;
    numero: string | null;
    serie: string | null;
    chave_acesso: string | null;
  } | null;
  items?: { product_name: string; quantity: number; unit_price: number; total_price: number }[];
}

type FiscalFilter = 'all' | 'autorizada' | 'cancelada' | 'pendente' | 'rejeitada' | 'sem_fiscal';

const STATUS_BADGE: Record<string, { label: string; icon: any; className: string }> = {
  autorizada: { label: 'NFC-e autorizada', icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  cancelada: { label: 'NFC-e cancelada', icon: Ban, className: 'bg-muted text-muted-foreground border-border' },
  pendente: { label: 'NFC-e pendente', icon: Clock, className: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  processando: { label: 'NFC-e processando', icon: Loader2, className: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  rejeitada: { label: 'NFC-e rejeitada', icon: XCircle, className: 'bg-destructive/15 text-destructive border-destructive/30' },
  denegada: { label: 'NFC-e denegada', icon: AlertTriangle, className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

/**
 * Lista do PDV — vendas do dia (ou intervalo) com status fiscal e ações por linha.
 * Equivalente ao "Lista do PDV" do Gweb. Lê de `pdv_sales` + join opcional
 * com `nfce_records` (por `sale_id`).
 */
export default function FrenteCaixaLista() {
  const navigate = useNavigate();
  const { company } = useAuthContext();
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);

  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [fiscalFilter, setFiscalFilter] = useState<FiscalFilter>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<SaleRow | null>(null);

  async function load() {
    if (!company?.id) return;
    setRefreshing(true);
    try {
      const from = startOfDay(new Date(dateFrom + 'T00:00:00')).toISOString();
      const to = endOfDay(new Date(dateTo + 'T00:00:00')).toISOString();

      const { data: sales, error } = await supabase
        .from('pdv_sales')
        .select(
          'id, created_at, final_total, discount, customer_name, notes, payment_method:payment_methods(name)'
        )
        .eq('company_id', company.id)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const ids = (sales || []).map((s) => s.id);
      let nfceMap = new Map<string, SaleRow['nfce']>();
      if (ids.length > 0) {
        const { data: nfces } = await supabase
          .from('nfce_records')
          .select('id, sale_id, status, numero, serie, chave_acesso')
          .eq('company_id', company.id)
          .in('sale_id', ids);
        (nfces || []).forEach((n: any) => {
          if (n.sale_id) nfceMap.set(n.sale_id, n);
        });
      }

      const merged: SaleRow[] = (sales || []).map((s: any) => ({
        ...s,
        nfce: nfceMap.get(s.id) ?? null,
      }));
      setRows(merged);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar lista: ' + e.message);
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
      // Filtro fiscal
      if (fiscalFilter !== 'all') {
        if (fiscalFilter === 'sem_fiscal') {
          if (r.nfce) return false;
        } else {
          if (r.nfce?.status !== fiscalFilter) return false;
        }
      }
      // Busca textual
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [
          r.customer_name,
          r.payment_method?.name,
          r.nfce?.numero,
          r.nfce?.chave_acesso,
          r.id.slice(0, 8),
          r.final_total.toFixed(2),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, fiscalFilter, search]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      sum: filtered.reduce((s, r) => s + (Number(r.final_total) || 0), 0),
    }),
    [filtered],
  );

  async function openSaleDetails(sale: SaleRow) {
    setSelected(sale);
    if (!sale.items) {
      const { data } = await supabase
        .from('pdv_sale_items')
        .select('product_name, quantity, unit_price, total_price')
        .eq('sale_id', sale.id);
      setSelected({ ...sale, items: (data as any) || [] });
    }
  }

  async function reprintDanfe(sale: SaleRow) {
    if (!sale.nfce?.id || sale.nfce.status !== 'autorizada') {
      toast.info('Esta venda não possui NFC-e autorizada para reimpressão.');
      return;
    }
    try {
      const { data: rec } = await supabase
        .from('nfce_records')
        .select('*')
        .eq('id', sale.nfce.id)
        .maybeSingle();
      if (!rec) {
        toast.error('NFC-e não encontrada');
        return;
      }
      await printDanfeFromRecord(rec as any);
    } catch (e: any) {
      toast.error('Falha ao reimprimir: ' + e.message);
    }
  }

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

  return (
    <PDVV2Layout>
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="border-b px-4 py-2 flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/frente-caixa')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="font-semibold">Lista do PDV</h1>
            <Badge variant="outline">Frente de Caixa</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>

        {/* Filtros */}
        <div className="border-b px-4 py-3 bg-muted/30 flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status fiscal</label>
            <Select value={fiscalFilter} onValueChange={(v) => setFiscalFilter(v as FiscalFilter)}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="autorizada">NFC-e autorizada</SelectItem>
                <SelectItem value="pendente">NFC-e pendente</SelectItem>
                <SelectItem value="rejeitada">NFC-e rejeitada</SelectItem>
                <SelectItem value="cancelada">NFC-e cancelada</SelectItem>
                <SelectItem value="sem_fiscal">Sem NFC-e</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[240px] space-y-1">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cliente, valor, forma de pagto, número NFC-e…"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div className="text-right ml-auto">
            <p className="text-xs text-muted-foreground">
              {totals.count} venda(s)
            </p>
            <p className="text-lg font-bold tabular-nums text-emerald-600">{brl(totals.sum)}</p>
          </div>
        </div>

        {/* Tabela */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma venda no período selecionado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Horário</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Fiscal</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right w-[160px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const cfg = r.nfce ? STATUS_BADGE[r.nfce.status] : null;
                  const Icon = cfg?.icon ?? FileMinus;
                  return (
                    <TableRow key={r.id} className="cursor-default hover:bg-muted/40">
                      <TableCell className="tabular-nums text-xs text-muted-foreground">
                        {format(new Date(r.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-sm">{r.customer_name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.payment_method?.name || '—'}</TableCell>
                      <TableCell>
                        {cfg ? (
                          <Badge variant="outline" className={`${cfg.className} text-[11px]`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {cfg.label}
                            {r.nfce?.numero ? ` #${r.nfce.numero}` : ''}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px] text-muted-foreground">
                            <FileMinus className="h-3 w-3 mr-1" />
                            Sem NFC-e
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-emerald-600">
                        {brl(Number(r.final_total) || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openSaleDetails(r)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => reprintDanfe(r)}
                            disabled={r.nfce?.status !== 'autorizada'}
                            title={
                              r.nfce?.status === 'autorizada'
                                ? 'Reimprimir DANFE'
                                : 'Sem NFC-e autorizada para reimprimir'
                            }
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ScrollArea>

        {/* Detalhes */}
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detalhes da venda</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Data</p>
                    <p>{format(new Date(selected.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pagamento</p>
                    <p>{selected.payment_method?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p>{selected.customer_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold text-emerald-600">{brl(Number(selected.final_total) || 0)}</p>
                  </div>
                </div>
                {selected.nfce && (
                  <div className="rounded-md border p-2 bg-muted/40">
                    <p className="text-xs text-muted-foreground">NFC-e</p>
                    <p className="text-xs">
                      Status: <strong>{selected.nfce.status}</strong>
                      {selected.nfce.numero ? ` · #${selected.nfce.numero}/${selected.nfce.serie}` : ''}
                    </p>
                    {selected.nfce.chave_acesso && (
                      <p className="text-[10px] font-mono break-all mt-1">{selected.nfce.chave_acesso}</p>
                    )}
                  </div>
                )}
                {selected.items && selected.items.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Itens</p>
                    <ul className="divide-y border rounded-md">
                      {selected.items.map((it, i) => (
                        <li key={i} className="flex justify-between px-2 py-1 text-xs">
                          <span className="truncate">
                            {it.quantity}× {it.product_name}
                          </span>
                          <span className="tabular-nums">{brl(Number(it.total_price) || 0)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Observações</p>
                    <p className="text-xs whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PDVV2Layout>
  );
}