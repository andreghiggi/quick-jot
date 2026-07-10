import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { supabase } from '@/integrations/supabase/client';
import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, History, Search, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { PDVV2ClosedTabSaleCard, ClosedTabSaleCardData } from '@/components/pdv-v2/PDVV2ClosedTabSaleCard';
import { getNFCeRecordBySaleId, type NFCeRecord } from '@/services/nfceService';
import { loadCancellationsBySaleIds, SaleCancellationRecord } from '@/utils/saleCancellation';
import { brl as formatPrice } from '@/components/pdv-v2/_format';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { expandSalesWithSplits } from '@/utils/expandSalesWithSplits';

function todayInSP(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function spDayBoundsISO(date: string): { startISO: string; endISO: string } {
  // "YYYY-MM-DD" interpretado em America/Sao_Paulo → ISO UTC
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(`${date}T23:59:59.999-03:00`);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export default function PDVV2ComandasHistorico() {
  const { company } = useAuthContext();
  const companyId = company?.id;
  const { settings } = useStoreSettings({ companyId });
  const { activePaymentMethods } = usePaymentMethods({ companyId, channel: 'pdv' });

  const [startDate, setStartDate] = useState<string>(todayInSP());
  const [endDate, setEndDate] = useState<string>(todayInSP());
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<ClosedTabSaleCardData[]>([]);
  const [nfceMap, setNfceMap] = useState<Record<string, NFCeRecord | null>>({});
  const [cancelMap, setCancelMap] = useState<Record<string, SaleCancellationRecord>>({});

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const { startISO } = spDayBoundsISO(startDate);
      const { endISO } = spDayBoundsISO(endDate);
      // Comandas fechadas no período — usadas para localizar vendas
      // que não gravaram "Comanda #N" no `notes` (ex.: fechamentos via
      // Frente de Caixa antigos).
      const { data: closedTabs } = await supabase
        .from('tabs')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'closed')
        .gte('closed_at', startISO)
        .lte('closed_at', endISO);
      const tabIds = (closedTabs || []).map((t: any) => t.id).filter(Boolean);

      const orFilter = tabIds.length
        ? `notes.ilike.%Comanda%,imported_order_id.in.(${tabIds.join(',')})`
        : `notes.ilike.%Comanda%`;

      const { data, error } = await supabase
        .from('pdv_sales')
        .select('id, final_total, customer_name, notes, created_at, payment_method_id, payment_method:payment_methods(name)')
        .eq('company_id', companyId)
        .or(orFilter)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const baseRows = (data || []).map((s: any) => ({
        id: s.id,
        real_id: s.id,
        final_total: Number(s.final_total) || 0,
        customer_name: s.customer_name,
        notes: s.notes,
        created_at: s.created_at,
        payment_method_id: s.payment_method_id ?? null,
        payment_method_name: s.payment_method?.name || 'Sem forma',
        origin: null,
      }));
      // Expande multi-pagamento: 1 linha por forma quando existirem splits.
      const expanded = await expandSalesWithSplits(baseRows as any);
      const rows: (ClosedTabSaleCardData & { real_id: string })[] = (expanded as any[]).map((s) => ({
        id: s.id,
        real_id: s.real_id || s.id.split('__')[0],
        final_total: Number(s.final_total) || 0,
        customer_name: s.customer_name,
        notes: s.notes,
        created_at: s.created_at,
        payment_method_name: s.payment_method_name || 'Sem forma',
      }));
      setSales(rows);

      // Carregar NFC-e e cancelamentos em paralelo
      const uniqueRealIds = Array.from(new Set(rows.map((r) => r.real_id)));
      const nfceEntries = await Promise.all(uniqueRealIds.map(async (id) => {
        try { return [id, await getNFCeRecordBySaleId(id)] as const; }
        catch { return [id, null] as const; }
      }));
      const nm: Record<string, NFCeRecord | null> = {};
      nfceEntries.forEach(([id, rec]) => { nm[id] = rec; });
      setNfceMap(nm);

      const cancelled = Array.from(new Set(
        rows.filter((s) => s.notes?.includes('[CANCELADA]')).map((s) => s.real_id)
      ));
      setCancelMap(cancelled.length ? await loadCancellationsBySaleIds(cancelled) : {});
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao carregar histórico');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (q) {
        const hit =
          (s.customer_name || '').toLowerCase().includes(q) ||
          (s.notes || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (paymentFilter.length > 0) {
        const name = s.payment_method_name || 'Sem forma';
        const match = paymentFilter.some((sel) =>
          sel === 'Sem forma' ? !s.payment_method_name || s.payment_method_name === 'Sem forma' : name === sel,
        );
        if (!match) return false;
      }
      return true;
    });
  }, [sales, search, paymentFilter]);

  const paymentOptions = useMemo(() => {
    const set = new Set<string>();
    let hasSem = false;
    for (const pm of activePaymentMethods) {
      if (pm.name) set.add(pm.name);
    }
    for (const s of sales) {
      const n = s.payment_method_name;
      if (!n || n === 'Sem forma') hasSem = true;
      else set.add(n);
    }
    const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (hasSem) list.push('Sem forma');
    return list;
  }, [sales, activePaymentMethods]);

  const paymentLabel =
    paymentFilter.length === 0
      ? 'Todas as formas'
      : paymentFilter.length === 1
        ? paymentFilter[0]
        : `${paymentFilter.length} formas`;

  const togglePayment = (name: string) => {
    setPaymentFilter((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  };

  const totals = useMemo(() => {
    let active = 0, cancelled = 0, revenue = 0;
    for (const s of filtered) {
      const isCancelled = !!s.notes?.includes('[CANCELADA]');
      if (isCancelled) cancelled++;
      else { active++; revenue += Number(s.final_total) || 0; }
    }
    return { active, cancelled, revenue };
  }, [filtered]);

  return (
    <PDVV2Layout>
      <div className="h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 space-y-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Histórico de Comandas</h1>
          </div>

          <Card>
            <CardContent className="p-4 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto_auto] items-end">
              <div className="space-y-1">
                <Label htmlFor="start">De</Label>
                <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end">Até</Label>
                <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="search">Buscar</Label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="search"
                    className="pl-8"
                    placeholder="Cliente, nº da comanda, observação…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Pagamento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 min-w-[180px] justify-between font-normal">
                      <span className="truncate">{paymentLabel}</span>
                      <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="flex items-center justify-between px-2 py-1.5 border-b mb-1">
                      <span className="text-xs font-medium text-muted-foreground">Formas de pagamento</span>
                      {paymentFilter.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setPaymentFilter([])}
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {paymentOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-2">Nenhuma forma disponível</p>
                      ) : (
                        paymentOptions.map((p) => (
                          <label
                            key={p}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                          >
                            <Checkbox
                              checked={paymentFilter.includes(p)}
                              onCheckedChange={() => togglePayment(p)}
                            />
                            <span className="text-sm">{p}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Button onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Aplicar
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Comandas ativas</p>
              <p className="text-lg font-bold">{totals.active}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Canceladas</p>
              <p className="text-lg font-bold text-destructive">{totals.cancelled}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Faturamento (ativas)</p>
              <p className="text-lg font-bold text-green-600">{formatPrice(totals.revenue)}</p>
            </CardContent></Card>
          </div>

          {loading && sales.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 mx-auto animate-spin mb-2" /> Carregando…
            </CardContent></Card>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma comanda no período.
            </CardContent></Card>
          ) : (
            <div className="space-y-2 pb-6">
              {filtered.map((s) => (
                <PDVV2ClosedTabSaleCard
                  key={s.id}
                  sale={s}
                  nfce={nfceMap[(s as any).real_id || s.id] || null}
                  cancellation={cancelMap[(s as any).real_id || s.id] || null}
                  companyId={companyId}
                  paperSize={(settings.printerPaperSize as '58mm' | '80mm') || '80mm'}
                  printLayout={settings.printLayout}
                  allowCancelSale={false}
                  onRequestCancelSale={() => { /* desabilitado fora do caixa atual */ }}
                  onNfceChanged={(saleId, rec) => setNfceMap((m) => ({ ...m, [saleId]: rec }))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PDVV2Layout>
  );
}