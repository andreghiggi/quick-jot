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
  MoreVertical,
  Copy,
  RotateCcw,
  Code2,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { supabase } from '@/integrations/supabase/client';
import { brl } from '@/components/pdv-v2/_format';
import {
  printDanfeFromRecord,
  emitirNFCe,
  consultarNFCe,
  cancelarNFCe,
  type NFCeItem,
} from '@/services/nfceService';
import { useProducts } from '@/hooks/useProducts';
import { useTaxRules } from '@/hooks/useTaxRules';
import { buildNfceFiscalFields } from '@/utils/nfceItemFiscal';
import { applyStockMovementOnce } from '@/hooks/useStockMovements';
import { usePdvSettings } from '@/hooks/usePdvSettings';
import { FileText } from 'lucide-react';

interface SaleRow {
  id: string;
  created_at: string;
  final_total: number;
  discount: number;
  customer_name: string | null;
  notes: string | null;
  pv_numero: number | null;
  fiscal_mode: string | null;
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
  const { products } = useProducts({ companyId: company?.id });
  const { taxRules } = useTaxRules({ companyId: company?.id });
  const { settings: pdvSettings } = usePdvSettings(company?.id);
  const [emittingId, setEmittingId] = useState<string | null>(null);

  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [fiscalFilter, setFiscalFilter] = useState<FiscalFilter>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<SaleRow | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SaleRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  function toggleMark(id: string) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function copyChaveAcesso(sale: SaleRow) {
    const chave = sale.nfce?.chave_acesso;
    if (!chave) {
      toast.info('Esta venda não possui chave de acesso.');
      return;
    }
    try {
      await navigator.clipboard.writeText(chave);
      toast.success('Chave de acesso copiada.');
    } catch {
      toast.error('Não foi possível copiar a chave.');
    }
  }

  async function consultarStatus(sale: SaleRow) {
    if (!company?.id) return;
    const rec = sale.nfce;
    if (!rec?.id) {
      toast.info('Esta venda não possui NFC-e para consultar.');
      return;
    }
    setActionLoadingId(sale.id);
    try {
      // Busca nfce_id (id da Fiscal Flow) — o consultarNFCe espera ele
      const { data: full } = await supabase
        .from('nfce_records')
        .select('nfce_id, status')
        .eq('id', rec.id)
        .maybeSingle();
      const nfceId = (full as any)?.nfce_id;
      if (!nfceId) {
        toast.error('NFC-e ainda sem identificador da SEFAZ.');
        return;
      }
      await consultarNFCe(company.id, nfceId);
      toast.success('Status atualizado.');
      await load();
    } catch (e: any) {
      toast.error('Falha ao consultar: ' + (e?.message || e));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function fetchXmlText(sale: SaleRow): Promise<string | null> {
    const xmlUrl = (sale.nfce as any)?.xml_url;
    if (!xmlUrl) {
      // Tenta buscar do banco caso não tenha vindo no select
      const { data } = await supabase
        .from('nfce_records')
        .select('xml_url')
        .eq('id', sale.nfce!.id)
        .maybeSingle();
      if (!data?.xml_url) return null;
      const res = await fetch(data.xml_url);
      if (!res.ok) return null;
      return await res.text();
    }
    const res = await fetch(xmlUrl);
    if (!res.ok) return null;
    return await res.text();
  }

  async function visualizarXml(sale: SaleRow) {
    if (!sale.nfce?.id || sale.nfce.status !== 'autorizada') {
      toast.info('Sem XML disponível para esta venda.');
      return;
    }
    setActionLoadingId(sale.id);
    try {
      const xml = await fetchXmlText(sale);
      if (!xml) {
        toast.error('XML não disponível.');
        return;
      }
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast.error('Falha ao abrir XML: ' + (e?.message || e));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function salvarDocumento(sale: SaleRow) {
    if (!sale.nfce?.id || sale.nfce.status !== 'autorizada') {
      toast.info('Sem documento disponível para salvar.');
      return;
    }
    setActionLoadingId(sale.id);
    try {
      const xml = await fetchXmlText(sale);
      if (!xml) {
        toast.error('XML não disponível.');
        return;
      }
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NFCe-${sale.nfce.chave_acesso || sale.nfce.numero || sale.id.slice(0, 8)}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      toast.success('Documento baixado.');
    } catch (e: any) {
      toast.error('Falha ao salvar: ' + (e?.message || e));
    } finally {
      setActionLoadingId(null);
    }
  }

  function openCancelDialog(sale: SaleRow) {
    if (!sale.nfce?.id || sale.nfce.status !== 'autorizada') {
      toast.info('Apenas NFC-e autorizada pode ser cancelada.');
      return;
    }
    setCancelTarget(sale);
    setCancelReason('');
  }

  async function confirmCancelNfce() {
    if (!company?.id || !cancelTarget?.nfce?.id) return;
    if (cancelReason.trim().length < 15) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres.');
      return;
    }
    setCancelling(true);
    try {
      const { data: full } = await supabase
        .from('nfce_records')
        .select('nfce_id')
        .eq('id', cancelTarget.nfce.id)
        .maybeSingle();
      const nfceId = (full as any)?.nfce_id;
      if (!nfceId) throw new Error('NFC-e sem identificador da SEFAZ.');
      await cancelarNFCe(company.id, nfceId, cancelReason.trim());
      toast.success('Cancelamento solicitado à SEFAZ.');
      setCancelTarget(null);
      setCancelReason('');
      await load();
    } catch (e: any) {
      toast.error('Falha ao cancelar: ' + (e?.message || e));
    } finally {
      setCancelling(false);
    }
  }

  async function load() {
    if (!company?.id) return;
    setRefreshing(true);
    try {
      const from = startOfDay(new Date(dateFrom + 'T00:00:00')).toISOString();
      const to = endOfDay(new Date(dateTo + 'T00:00:00')).toISOString();

      const { data: sales, error } = await supabase
        .from('pdv_sales')
        .select(
          'id, created_at, final_total, discount, customer_name, notes, pv_numero, fiscal_mode, payment_method:payment_methods(name)'
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

  /**
   * Fase 3 — emitir NFC-e retroativamente para uma pré-venda (sem NFC-e
   * autorizada). Reaproveita os itens já gravados em `pdv_sale_items` e
   * a engine `emitirNFCe`. Quando o operador tem `stock_move_on_fiscal_only`
   * ligado, dispara também a baixa de estoque que ficou pendente.
   */
  async function emitNfceRetroativa(sale: SaleRow) {
    if (!company?.id) return;
    if (sale.nfce?.status === 'autorizada' || sale.nfce?.status === 'processando') {
      toast.info('Esta venda já possui NFC-e em andamento.');
      return;
    }
    setEmittingId(sale.id);
    try {
      const { data: itemsData, error: itErr } = await supabase
        .from('pdv_sale_items')
        .select('product_id, product_name, quantity, unit_price')
        .eq('sale_id', sale.id);
      if (itErr) throw itErr;
      const saleItems = (itemsData as any[]) || [];
      if (saleItems.length === 0) {
        toast.error('Venda sem itens — não é possível emitir NFC-e.');
        return;
      }
      const nfceItems: NFCeItem[] = saleItems.map((it) => {
        const product = it.product_id ? products.find((p) => p.id === it.product_id) : null;
        const taxRule = (product as any)?.taxRuleId
          ? taxRules.find((tr) => tr.id === (product as any).taxRuleId)
          : null;
        const fallbackNcm = it.product_id ? '00000000' : '21069090';
        return {
          codigo: (product as any)?.code || it.product_id || 'AVULSO',
          descricao: it.product_name,
          unidade: ((product as any)?.unit as string) || 'UN',
          quantidade: Number(it.quantity) || 1,
          valor_unitario: Number(it.unit_price) || 0,
          ...buildNfceFiscalFields({ product: product as any, taxRule, mercadoEnabled: true, fallbackNcm }),
        };
      });
      const externalId = `FCX-RETRO-${sale.id.substring(0, 8)}-${Date.now()}`;
      await emitirNFCe(company.id, sale.id, {
        external_id: externalId,
        itens: nfceItems,
        valor_desconto: Number(sale.discount) || 0,
        valor_frete: 0,
        observacoes: sale.customer_name ? `Cliente: ${sale.customer_name}` : undefined,
      } as any);
      // Marca venda como fiscal e dispara baixa de estoque pendente (se aplicável).
      await supabase
        .from('pdv_sales')
        .update({ fiscal_mode: 'fiscal' } as any)
        .eq('id', sale.id);
      if (pdvSettings.stock_move_on_fiscal_only) {
        (async () => {
          for (const it of saleItems) {
            if (!it.product_id) continue;
            await applyStockMovementOnce({
              productId: it.product_id,
              quantity: -(Number(it.quantity) || 0),
              type: 'sale',
              referenceType: 'pdv_sale',
              referenceId: sale.id,
              notes: 'Baixa retroativa via emissão NFC-e',
            });
          }
        })();
      }
      toast.success('NFC-e enviada para processamento.');
      await load();
    } catch (e: any) {
      console.error('[FrenteCaixaLista] emitNfceRetroativa', e);
      toast.error('Falha ao emitir NFC-e: ' + (e?.message || e));
    } finally {
      setEmittingId(null);
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
            <ul className="divide-y">
              {filtered.map((r) => {
                const isFiscal = r.nfce?.status === 'autorizada' || r.nfce?.status === 'processando';
                const hasNfce = !!r.nfce;
                const cfg = hasNfce ? STATUS_BADGE[r.nfce!.status] : null;
                const StatusIcon = cfg?.icon ?? FileMinus;
                const numero = hasNfce
                  ? (r.nfce!.numero || '—')
                  : (r.pv_numero != null ? String(r.pv_numero) : `#${r.id.slice(0, 6).toUpperCase()}`);
                const canEmit = !r.nfce || (r.nfce.status !== 'autorizada' && r.nfce.status !== 'processando' && r.nfce.status !== 'cancelada');
                return (
                  <li key={r.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {r.customer_name || 'Consumidor final'}
                        </p>
                        <p className="text-xs italic text-muted-foreground mt-0.5">
                          <span className="font-medium not-italic">Número:</span> {numero}
                          {hasNfce && r.nfce!.serie && (
                            <>
                              {' '}|{' '}
                              <span className="font-medium not-italic">Série:</span> {r.nfce!.serie}
                            </>
                          )}
                          {' '}|{' '}
                          <span className="font-medium not-italic">Emissão:</span>{' '}
                          {format(new Date(r.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          {' '}|{' '}
                          <span className="font-medium not-italic">Total:</span>{' '}
                          <span className="font-semibold text-emerald-600 not-italic">
                            {brl(Number(r.final_total) || 0)}
                          </span>
                          {r.payment_method?.name && (
                            <span className="not-italic"> ({r.payment_method.name})</span>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {/* Tipo do documento */}
                          {isFiscal ? (
                            <Badge className="bg-amber-400 hover:bg-amber-400 text-amber-950 border-0 text-[10px] font-bold uppercase">
                              NFC-e
                            </Badge>
                          ) : (
                            <Badge className="bg-orange-500 hover:bg-orange-500 text-white border-0 text-[10px] font-bold uppercase">
                              PV
                            </Badge>
                          )}
                          {/* Status fiscal */}
                          {hasNfce ? (
                            <Badge
                              className={
                                r.nfce!.status === 'autorizada'
                                  ? 'bg-emerald-600 hover:bg-emerald-600 text-white border-0 text-[10px]'
                                  : r.nfce!.status === 'cancelada'
                                  ? 'bg-muted text-muted-foreground border text-[10px]'
                                  : r.nfce!.status === 'rejeitada' || r.nfce!.status === 'denegada'
                                  ? 'bg-destructive hover:bg-destructive text-white border-0 text-[10px]'
                                  : 'bg-amber-500 hover:bg-amber-500 text-white border-0 text-[10px]'
                              }
                            >
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {cfg?.label ?? r.nfce!.status}
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500 hover:bg-red-500 text-white border-0 text-[10px]">
                              Pendente de emissão do documento fiscal
                            </Badge>
                          )}
                          {/* Status operacional (só pré-venda) */}
                          {!isFiscal && (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0 text-[10px]">
                              Pré-venda concluída
                            </Badge>
                          )}
                        </div>
                      </div>
                      {/* Ações */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openSaleDetails(r)}
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEmit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-primary"
                            onClick={() => emitNfceRetroativa(r)}
                            disabled={emittingId === r.id}
                            title="Emitir NFC-e desta venda"
                          >
                            {emittingId === r.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </Button>
                        )}
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
                    </div>
                  </li>
                );
              })}
            </ul>
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