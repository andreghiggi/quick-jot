import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { supabase } from '@/integrations/supabase/client';
import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, History, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PDVV2ClosedTabSaleCard, ClosedTabSaleCardData } from '@/components/pdv-v2/PDVV2ClosedTabSaleCard';
import { getNFCeRecordBySaleId, type NFCeRecord } from '@/services/nfceService';
import { loadCancellationsBySaleIds, SaleCancellationRecord } from '@/utils/saleCancellation';
import { brl as formatPrice } from '@/components/pdv-v2/_format';

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

  const [startDate, setStartDate] = useState<string>(todayInSP());
  const [endDate, setEndDate] = useState<string>(todayInSP());
  const [search, setSearch] = useState('');
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
      const { data, error } = await supabase
        .from('pdv_sales')
        .select('id, final_total, customer_name, notes, created_at, payment_method:payment_methods(name)')
        .eq('company_id', companyId)
        .ilike('notes', '%Comanda%')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows: ClosedTabSaleCardData[] = (data || []).map((s: any) => ({
        id: s.id,
        final_total: Number(s.final_total) || 0,
        customer_name: s.customer_name,
        notes: s.notes,
        created_at: s.created_at,
        payment_method_name: s.payment_method?.name || 'Sem forma',
      }));
      setSales(rows);

      // Carregar NFC-e e cancelamentos em paralelo
      const nfceEntries = await Promise.all(rows.map(async (s) => {
        try { return [s.id, await getNFCeRecordBySaleId(s.id)] as const; }
        catch { return [s.id, null] as const; }
      }));
      const nm: Record<string, NFCeRecord | null> = {};
      nfceEntries.forEach(([id, rec]) => { nm[id] = rec; });
      setNfceMap(nm);

      const cancelled = rows.filter((s) => s.notes?.includes('[CANCELADA]')).map((s) => s.id);
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
    if (!q) return sales;
    return sales.filter((s) =>
      (s.customer_name || '').toLowerCase().includes(q) ||
      (s.notes || '').toLowerCase().includes(q),
    );
  }, [sales, search]);

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
            <CardContent className="p-4 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] items-end">
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
                  nfce={nfceMap[s.id] || null}
                  cancellation={cancelMap[s.id] || null}
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