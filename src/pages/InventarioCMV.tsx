import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { TrendingUp, FileText, FileSpreadsheet, Loader2, Calculator } from 'lucide-react';
import { format } from 'date-fns';

import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';

function fmtQty(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtPct(v: number) {
  if (!isFinite(v)) return '-';
  return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

interface CmvRow {
  product_id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  revenue: number;
  cmv: number;
  margin: number; // R$
  margin_pct: number; // 0..1
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function InventarioCMV() {
  const { company } = useAuthContext();
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);
  const { products, loading: productsLoading } = useProducts({ companyId: company?.id });

  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth());
  const [dateTo, setDateTo] = useState<string>(today());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pdv' | 'cardapio'>('all');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CmvRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  );

  const productMap = useMemo(() => {
    const m = new Map<string, any>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  async function generate() {
    if (!company?.id) return;
    if (!dateFrom || !dateTo) {
      toast.error('Informe o período');
      return;
    }
    setLoading(true);
    try {
      const fromIso = `${dateFrom}T00:00:00-03:00`;
      const toIso = `${dateTo}T23:59:59-03:00`;

      // Acc por produto
      const acc = new Map<string, { qty: number; revenue: number }>();
      const bump = (pid: string | null, qty: number, revenue: number) => {
        if (!pid) return;
        const cur = acc.get(pid) || { qty: 0, revenue: 0 };
        cur.qty += qty;
        cur.revenue += revenue;
        acc.set(pid, cur);
      };

      // 1. Vendas PDV (pdv_sale_items) — busca via sale_id filtrando pdv_sales pelo período
      if (sourceFilter !== 'cardapio') {
        const { data: sales, error: sErr } = await (supabase as any)
          .from('pdv_sales')
          .select('id')
          .eq('company_id', company.id)
          .gte('created_at', fromIso)
          .lte('created_at', toIso);
        if (sErr) throw sErr;
        const saleIds = (sales || []).map((s: any) => s.id);
        if (saleIds.length) {
          // pagina em blocos de 300 pra evitar URL enorme
          const chunks: string[][] = [];
          for (let i = 0; i < saleIds.length; i += 300) chunks.push(saleIds.slice(i, i + 300));
          for (const chunk of chunks) {
            const { data: items, error: iErr } = await (supabase as any)
              .from('pdv_sale_items')
              .select('product_id, quantity, total_price')
              .in('sale_id', chunk);
            if (iErr) throw iErr;
            (items || []).forEach((it: any) => {
              bump(it.product_id, Number(it.quantity || 0), Number(it.total_price || 0));
            });
          }
        }
      }

      // 2. Vendas Cardápio (order_items) — orders com status != cancelled, no período
      if (sourceFilter !== 'pdv') {
        const { data: orders, error: oErr } = await (supabase as any)
          .from('orders')
          .select('id')
          .eq('company_id', company.id)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .neq('status', 'cancelled');
        if (oErr) throw oErr;
        const orderIds = (orders || []).map((o: any) => o.id);
        if (orderIds.length) {
          const chunks: string[][] = [];
          for (let i = 0; i < orderIds.length; i += 300) chunks.push(orderIds.slice(i, i + 300));
          for (const chunk of chunks) {
            const { data: items, error: iErr } = await (supabase as any)
              .from('order_items')
              .select('product_id, quantity, price')
              .in('order_id', chunk);
            if (iErr) throw iErr;
            (items || []).forEach((it: any) => {
              const qty = Number(it.quantity || 0);
              const price = Number(it.price || 0);
              bump(it.product_id, qty, qty * price);
            });
          }
        }
      }

      // Monta linhas
      const result: CmvRow[] = [];
      acc.forEach((v, pid) => {
        const p = productMap.get(pid);
        if (!p) return;
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return;
        const unitCost = Number((p as any).costPrice || 0);
        const cmv = v.qty * unitCost;
        const margin = v.revenue - cmv;
        const marginPct = v.revenue > 0 ? margin / v.revenue : 0;
        result.push({
          product_id: pid,
          code: (p as any).code || '',
          name: p.name,
          category: p.category || '',
          unit: (p as any).unit || 'UN',
          quantity: v.qty,
          unit_cost: unitCost,
          revenue: v.revenue,
          cmv,
          margin,
          margin_pct: marginPct,
        });
      });

      result.sort((a, b) => b.revenue - a.revenue);
      setRows(result);
      setGeneratedAt(new Date());
      toast.success(`CMV gerado: ${result.length} produto(s)`);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao gerar CMV', { description: err?.message });
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const cmv = rows.reduce((s, r) => s + r.cmv, 0);
    const margin = revenue - cmv;
    const marginPct = revenue > 0 ? margin / revenue : 0;
    return { revenue, cmv, margin, marginPct, items: rows.length };
  }, [rows]);

  const byCategory = useMemo(() => {
    const m = new Map<string, { revenue: number; cmv: number }>();
    rows.forEach((r) => {
      const key = r.category || '(sem categoria)';
      const cur = m.get(key) || { revenue: 0, cmv: 0 };
      cur.revenue += r.revenue;
      cur.cmv += r.cmv;
      m.set(key, cur);
    });
    return Array.from(m.entries())
      .map(([category, v]) => ({
        category,
        revenue: v.revenue,
        cmv: v.cmv,
        margin: v.revenue - v.cmv,
        margin_pct: v.revenue > 0 ? (v.revenue - v.cmv) / v.revenue : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  async function exportExcel() {
    if (!rows.length) return;
    const XLSX = await import('xlsx');
    const header = [
      'Código', 'Descrição', 'Categoria', 'Un.',
      'Qtd vendida', 'Custo unit. (R$)', 'CMV (R$)', 'Receita (R$)', 'Margem (R$)', 'Margem %',
    ];
    const data = rows.map((r) => [
      r.code, r.name, r.category, r.unit,
      r.quantity, r.unit_cost, r.cmv, r.revenue, r.margin, Number((r.margin_pct * 100).toFixed(2)),
    ]);
    data.push([]);
    data.push(['', 'TOTAIS', '', '', '', '', totals.cmv, totals.revenue, totals.margin, Number((totals.marginPct * 100).toFixed(2))]);

    const ws = XLSX.utils.aoa_to_sheet([
      [`Relatório de CMV — ${company?.name || ''}`],
      [`Período: ${format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy')} a ${format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy')}`],
      [`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
      [],
      header,
      ...data,
    ]);
    ws['!cols'] = [
      { wch: 12 }, { wch: 42 }, { wch: 20 }, { wch: 6 },
      { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CMV');
    XLSX.writeFile(wb, `cmv-${dateFrom}-a-${dateTo}.xlsx`);
  }

  async function exportPDF() {
    if (!rows.length) return;
    const { jsPDF } = await import('jspdf');
    const autoTableMod: any = await import('jspdf-autotable');
    const autoTable = autoTableMod.default || autoTableMod;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const dFrom = format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy');
    const dTo = format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy');

    doc.setFontSize(14);
    doc.text('Relatório de CMV — Custo da Mercadoria Vendida', 40, 40);
    doc.setFontSize(10);
    doc.text(company?.name || '', 40, 58);
    if ((company as any)?.cnpj) doc.text(`CNPJ: ${(company as any).cnpj}`, 40, 72);
    doc.text(`Período: ${dFrom} a ${dTo}`, 40, 86);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 40, 100);

    doc.setFontSize(11);
    doc.text(
      `Receita: ${fmtMoney(totals.revenue)}   •   CMV: ${fmtMoney(totals.cmv)}   •   Margem Bruta: ${fmtMoney(totals.margin)} (${fmtPct(totals.marginPct)})`,
      40, 120,
    );

    autoTable(doc, {
      startY: 135,
      head: [['Código', 'Descrição', 'Un.', 'Qtd', 'Custo un.', 'CMV', 'Receita', 'Margem', 'Margem %']],
      body: rows.map((r) => [
        r.code, r.name, r.unit,
        fmtQty(r.quantity),
        fmtMoney(r.unit_cost),
        fmtMoney(r.cmv),
        fmtMoney(r.revenue),
        fmtMoney(r.margin),
        fmtPct(r.margin_pct),
      ]),
      foot: [[
        '', 'TOTAIS', '', '', '',
        fmtMoney(totals.cmv),
        fmtMoney(totals.revenue),
        fmtMoney(totals.margin),
        fmtPct(totals.marginPct),
      ]],
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [51, 65, 85] },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
      columnStyles: {
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
      },
    });

    doc.save(`cmv-${dateFrom}-a-${dateTo}.pdf`);
  }

  if (mercadoLoading) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      </AppLayout>
    );
  }
  if (!mercadoEnabled) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              Relatório de CMV
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Custo da Mercadoria Vendida no período. Fórmula item a item: quantidade vendida × custo unitário atual do cadastro.
            </p>
          </div>
          <Badge variant="outline">Fase 3 — Estoque</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parâmetros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="from">De</Label>
                <Input id="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to">Até</Label>
                <Input id="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={sourceFilter} onValueChange={(v: any) => setSourceFilter(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas (PDV + Cardápio)</SelectItem>
                    <SelectItem value="pdv">Somente PDV / Frente de Caixa</SelectItem>
                    <SelectItem value="cardapio">Somente Cardápio Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={generate} disabled={loading || productsLoading} className="w-full">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calculator className="w-4 h-4 mr-2" />}
                  Gerar CMV
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O custo unitário utilizado é o custo atual do cadastro (products.cost_price). Para máxima fidelidade contábil, mantenha os custos atualizados via importação de XML de compra e feche uma contagem física próxima do início do período.
            </p>
          </CardContent>
        </Card>

        {generatedAt && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Receita</div>
                <div className="text-lg font-semibold text-emerald-600">{fmtMoney(totals.revenue)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">CMV</div>
                <div className="text-lg font-semibold text-rose-600">{fmtMoney(totals.cmv)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Margem bruta</div>
                <div className="text-lg font-semibold">{fmtMoney(totals.margin)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Margem %</div>
                <div className="text-lg font-semibold">{fmtPct(totals.marginPct)}</div>
              </div>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">Por categoria</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Período: {format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy')} a {format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy')} • Gerado em {format(generatedAt, 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportPDF} disabled={!rows.length}>
                    <FileText className="w-4 h-4 mr-2" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportExcel} disabled={!rows.length}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                        <TableHead className="text-right">CMV</TableHead>
                        <TableHead className="text-right">Margem</TableHead>
                        <TableHead className="text-right w-24">Margem %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byCategory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                            Nenhuma venda no período.
                          </TableCell>
                        </TableRow>
                      ) : byCategory.map((c) => (
                        <TableRow key={c.category}>
                          <TableCell className="font-medium">{c.category}</TableCell>
                          <TableCell className="text-right">{fmtMoney(c.revenue)}</TableCell>
                          <TableCell className="text-right text-rose-600">{fmtMoney(c.cmv)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(c.margin)}</TableCell>
                          <TableCell className="text-right">{fmtPct(c.margin_pct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhe por produto</CardTitle>
              </CardHeader>
              <CardContent>
                <Separator className="mb-3" />
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-16">Un.</TableHead>
                        <TableHead className="w-24 text-right">Qtd</TableHead>
                        <TableHead className="w-28 text-right">Custo un.</TableHead>
                        <TableHead className="w-28 text-right">CMV</TableHead>
                        <TableHead className="w-28 text-right">Receita</TableHead>
                        <TableHead className="w-28 text-right">Margem</TableHead>
                        <TableHead className="w-20 text-right">Margem %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                            Nenhuma venda no período.
                          </TableCell>
                        </TableRow>
                      ) : rows.map((r) => (
                        <TableRow key={r.product_id}>
                          <TableCell className="font-mono text-xs">{r.code}</TableCell>
                          <TableCell>
                            <div className="font-medium">{r.name}</div>
                            {r.category && <div className="text-xs text-muted-foreground">{r.category}</div>}
                          </TableCell>
                          <TableCell>{r.unit}</TableCell>
                          <TableCell className="text-right">{fmtQty(r.quantity)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(r.unit_cost)}</TableCell>
                          <TableCell className="text-right text-rose-600">{fmtMoney(r.cmv)}</TableCell>
                          <TableCell className="text-right text-emerald-600">{fmtMoney(r.revenue)}</TableCell>
                          <TableCell className="text-right font-medium">{fmtMoney(r.margin)}</TableCell>
                          <TableCell className="text-right">{fmtPct(r.margin_pct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}