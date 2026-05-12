import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Printer, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { brl } from '@/components/pdv-v2/_format';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { printCashClosingDetailed } from '@/utils/cashClosingPrint';
import type { CloseCashSale } from '@/components/pdv-v2/PDVV2CloseCashDialog';
import { toast } from 'sonner';

interface RegisterRow {
  id: string;
  status: 'open' | 'closed' | string;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  operator_name?: string | null;
}

function startOfDayLocalISO(d: string): string {
  // d = 'YYYY-MM-DD' (local input). Converte para UTC ISO considerando America/Sao_Paulo (-03:00).
  return new Date(`${d}T00:00:00-03:00`).toISOString();
}
function endOfDayLocalISO(d: string): string {
  return new Date(`${d}T23:59:59.999-03:00`).toISOString();
}

function fmtTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function CashReport() {
  const { company } = useAuthContext();
  const companyId = company?.id;
  const { settings } = useStoreSettings({ companyId });
  const { isModuleEnabled, loading: modulesLoading } = useCompanyModules({ companyId });

  // Disponível para qualquer loja com PDV V2 ativo.
  const isAllowed = isModuleEnabled('pdv_v2');

  const today = format(new Date(), 'yyyy-MM-dd');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [registers, setRegisters] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [salesByRegister, setSalesByRegister] = useState<Record<string, CloseCashSale[]>>({});
  const [loadingSales, setLoadingSales] = useState<string | null>(null);

  const paperSize = (settings?.printerPaperSize as '58mm' | '80mm') || '80mm';

  async function fetchRegisters() {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .select('id,status,opening_amount,closing_amount,expected_amount,difference,notes,opened_at,closed_at,opened_by')
        .eq('company_id', companyId)
        .gte('opened_at', startOfDayLocalISO(from))
        .lte('opened_at', endOfDayLocalISO(to))
        .order('opened_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as RegisterRow[];

      // Carrega nomes de operadores
      const userIds = Array.from(new Set(rows.map((r) => r.opened_by).filter(Boolean)));
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        const map = new Map((profs || []).map((p: any) => [p.id, p.full_name || p.email]));
        rows.forEach((r) => { r.operator_name = map.get(r.opened_by) || null; });
      }
      setRegisters(rows);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar caixas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAllowed) fetchRegisters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isAllowed]);

  async function loadSales(registerId: string): Promise<CloseCashSale[]> {
    if (salesByRegister[registerId]) return salesByRegister[registerId];
    setLoadingSales(registerId);
    try {
      const { data: sales, error } = await supabase
        .from('pdv_sales')
        .select('id, final_total, payment_method_id, customer_name, notes, created_at, order_id, payment_method:payment_methods(name)')
        .eq('cash_register_id', registerId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const orderIds = Array.from(new Set((sales || []).map((s: any) => s.order_id).filter(Boolean)));
      let ordersMap = new Map<string, { origin: string; delivery_address: string | null }>();
      if (orderIds.length) {
        const { data: ord } = await supabase
          .from('orders')
          .select('id, origin, delivery_address')
          .in('id', orderIds);
        ordersMap = new Map((ord || []).map((o: any) => [o.id, { origin: o.origin, delivery_address: o.delivery_address }]));
      }

      const mapped: CloseCashSale[] = (sales || []).map((s: any) => {
        let origin: CloseCashSale['origin'] = 'balcao';
        let pmName = s.payment_method?.name || 'Sem forma';
        if (s.notes) {
          const tefMatch = s.notes.match(/\|\s*(Débito|Crédito à Vista|PIX|\d+x\s*(?:Cartão\s*(?:ADM|Loja)|Crédito))/i);
          if (tefMatch) pmName = `${pmName} (${tefMatch[1]})`;
        }
        if (s.order_id) {
          const linked = ordersMap.get(s.order_id);
          if (linked) {
            if (linked.origin === 'mesa') origin = 'mesa';
            else if (linked.origin === 'balcao') origin = 'balcao';
            else origin = (linked.delivery_address && linked.delivery_address.trim().length > 0)
              ? 'cardapio_delivery' : 'cardapio_retirada';
          } else {
            origin = 'outros';
          }
        } else {
          if (s.notes?.toLowerCase().includes('comanda')) origin = 'mesa';
          else origin = 'balcao';
        }
        return {
          id: s.id,
          final_total: Number(s.final_total) || 0,
          payment_method_id: s.payment_method_id || null,
          payment_method_name: pmName,
          customer_name: s.customer_name || null,
          created_at: s.created_at,
          origin,
        };
      });

      setSalesByRegister((prev) => ({ ...prev, [registerId]: mapped }));
      return mapped;
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar vendas do caixa');
      return [];
    } finally {
      setLoadingSales(null);
    }
  }

  async function handleExpand(reg: RegisterRow) {
    if (expandedId === reg.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(reg.id);
    await loadSales(reg.id);
  }

  async function handlePrint(reg: RegisterRow) {
    const sales = await loadSales(reg.id);
    const expected = reg.expected_amount != null
      ? Number(reg.expected_amount)
      : Number(reg.opening_amount) + sales.reduce((a, s) => a + s.final_total, 0);
    printCashClosingDetailed({
      companyName: company?.name,
      paperSize,
      expectedAmount: expected,
      sales,
      registerInfo: {
        openedAt: reg.opened_at,
        closedAt: reg.closed_at,
        openingAmount: reg.opening_amount,
        closingAmount: reg.closing_amount,
        difference: reg.difference,
        operatorName: reg.operator_name,
        notes: reg.notes,
        status: reg.status,
      },
    });
  }

  // Agrupa por dia (data de abertura, BRT)
  const grouped = useMemo(() => {
    const map: Record<string, RegisterRow[]> = {};
    for (const r of registers) {
      const day = fmtDate(r.opened_at);
      if (!map[day]) map[day] = [];
      map[day].push(r);
    }
    return map;
  }, [registers]);

  if (!companyId) return null;
  if (modulesLoading) return null;
  if (!isAllowed) return <Navigate to="/relatorios/vendas" replace />;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Caixa</h1>
          <p className="text-sm text-muted-foreground">
            Histórico de caixas, com detalhamento por origem e forma de pagamento.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button onClick={fetchRegisters} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Aplicar filtro
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : registers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Nenhum caixa encontrado no período.
        </CardContent></Card>
      ) : (
        Object.entries(grouped).map(([day, items]) => (
          <div key={day} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {day} <span className="text-xs">({items.length} {items.length === 1 ? 'caixa' : 'caixas'})</span>
            </h2>
            {items.map((reg) => {
              const isOpen = expandedId === reg.id;
              const sales = salesByRegister[reg.id] || [];
              const totalVendas = sales.reduce((a, s) => a + s.final_total, 0);
              const expected = reg.expected_amount != null
                ? Number(reg.expected_amount)
                : Number(reg.opening_amount) + totalVendas;

              // Agrupa para visualização
              const byOrigin: Record<string, Record<string, { total: number; count: number }>> = {};
              const byPayment: Record<string, { total: number; count: number }> = {};
              for (const s of sales) {
                const o = s.origin || 'outros';
                const p = s.payment_method_name || 'Sem forma';
                if (!byOrigin[o]) byOrigin[o] = {};
                if (!byOrigin[o][p]) byOrigin[o][p] = { total: 0, count: 0 };
                byOrigin[o][p].total += s.final_total;
                byOrigin[o][p].count += 1;
                if (!byPayment[p]) byPayment[p] = { total: 0, count: 0 };
                byPayment[p].total += s.final_total;
                byPayment[p].count += 1;
              }

              return (
                <Card key={reg.id}>
                  <CardHeader
                    className="p-4 cursor-pointer hover:bg-accent/30"
                    onClick={() => handleExpand(reg)}
                  >
                    <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <Badge variant={reg.status === 'open' ? 'default' : 'outline'}>
                          {reg.status === 'open' ? 'Aberto' : 'Fechado'}
                        </Badge>
                        <span className="text-sm font-normal text-muted-foreground">
                          Abertura {fmtTime(reg.opened_at)} • Fechamento {reg.status === 'open' ? '—' : fmtTime(reg.closed_at)}
                        </span>
                        {reg.operator_name && (
                          <span className="text-sm font-normal text-muted-foreground">
                            • {reg.operator_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          Esperado: <span className="text-foreground font-semibold">{brl(expected)}</span>
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handlePrint(reg); }}
                          disabled={loadingSales === reg.id}
                        >
                          {loadingSales === reg.id
                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            : <Printer className="h-4 w-4 mr-2" />}
                          Imprimir
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>

                  {isOpen && (
                    <CardContent className="p-4 pt-0 space-y-4">
                      {/* Resumo do caixa */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Abertura</p>
                          <p className="tabular-nums font-medium">{brl(Number(reg.opening_amount))}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Esperado</p>
                          <p className="tabular-nums font-medium">{brl(expected)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Fechado</p>
                          <p className="tabular-nums font-medium">
                            {reg.closing_amount != null ? brl(Number(reg.closing_amount)) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Diferença</p>
                          <p className={`tabular-nums font-medium ${
                            reg.difference == null ? '' :
                            Number(reg.difference) === 0 ? 'text-green-600' :
                            Number(reg.difference) > 0 ? 'text-blue-600' : 'text-destructive'
                          }`}>
                            {reg.difference != null ? brl(Number(reg.difference)) : '—'}
                          </p>
                        </div>
                      </div>

                      {loadingSales === reg.id ? (
                        <Skeleton className="h-24 w-full" />
                      ) : sales.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhuma venda neste caixa.
                        </p>
                      ) : (
                        <>
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Por origem × forma de pagamento</h4>
                            <div className="space-y-3">
                              {Object.entries(byOrigin).map(([origin, methods]) => {
                                const sub = Object.values(methods).reduce((a, v) => a + v.total, 0);
                                const subCount = Object.values(methods).reduce((a, v) => a + v.count, 0);
                                const label = ({
                                  balcao: 'Vendas Balcão',
                                  cardapio_retirada: 'Retiradas (cobradas no PDV)',
                                  cardapio_delivery: 'Deliveries',
                                  mesa: 'Mesas Importadas',
                                  outros: 'Outros',
                                } as Record<string, string>)[origin] || origin;
                                return (
                                  <div key={origin} className="rounded-md border p-3">
                                    <div className="flex justify-between font-semibold text-sm mb-1">
                                      <span>{label} <span className="text-xs font-normal text-muted-foreground">({subCount})</span></span>
                                      <span className="tabular-nums">{brl(sub)}</span>
                                    </div>
                                    <div className="text-xs space-y-0.5">
                                      {Object.entries(methods).map(([pay, v]) => (
                                        <div key={pay} className="flex justify-between">
                                          <span className="text-muted-foreground">{pay} <span className="opacity-70">({v.count})</span></span>
                                          <span className="tabular-nums">{brl(v.total)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <h4 className="text-sm font-semibold mb-2">Totais por forma de pagamento</h4>
                            <div className="rounded-md border p-3 text-sm space-y-1">
                              {Object.entries(byPayment).map(([pay, v]) => (
                                <div key={pay} className="flex justify-between">
                                  <span>{pay} <span className="text-xs text-muted-foreground">({v.count})</span></span>
                                  <span className="tabular-nums font-medium">{brl(v.total)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between border-t pt-1 mt-1 font-semibold">
                                <span>Total geral ({sales.length})</span>
                                <span className="tabular-nums">{brl(totalVendas)}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {reg.notes && (
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Observações</h4>
                          <pre className="text-xs whitespace-pre-wrap font-sans bg-muted/40 p-2 rounded">{reg.notes}</pre>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}