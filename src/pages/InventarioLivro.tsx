import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BookOpen, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
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

interface LivroRow {
  id: string;
  code: string;
  gtin: string;
  name: string;
  category: string;
  unit: string;
  ncm: string;
  quantity: number; // saldo na data
  unit_cost: number;
  total: number;
}

function defaultCutoff(): string {
  // 31/12 do ano anterior, se estamos após 01/03; senão 31/12 de dois anos atrás
  const today = new Date();
  const y = today.getMonth() >= 2 ? today.getFullYear() - 1 : today.getFullYear() - 2;
  return `${y}-12-31`;
}

export default function InventarioLivro() {
  const { company } = useAuthContext();
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);
  const { products, loading: productsLoading } = useProducts({ companyId: company?.id });

  const [cutoffDate, setCutoffDate] = useState<string>(defaultCutoff());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [includeZero, setIncludeZero] = useState<'no' | 'yes'>('no');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LivroRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(products.filter((p) => (p as any).trackStock).map((p) => p.category).filter(Boolean))).sort(),
    [products],
  );

  async function generate() {
    if (!company?.id) return;
    if (!cutoffDate) {
      toast.error('Informe a data de corte');
      return;
    }
    setLoading(true);
    try {
      // fim do dia da data de corte (America/Sao_Paulo → -03:00)
      const cutoffIso = `${cutoffDate}T23:59:59-03:00`;

      // busca todas as movimentações POSTERIORES à data de corte
      // (para rebobinar a partir do saldo atual)
      const { data: movs, error: mErr } = await (supabase as any)
        .from('stock_movements')
        .select('product_id, quantity, created_at')
        .eq('company_id', company.id)
        .gt('created_at', cutoffIso);

      if (mErr) throw mErr;

      const deltaAfter = new Map<string, number>();
      (movs || []).forEach((m: any) => {
        deltaAfter.set(m.product_id, (deltaAfter.get(m.product_id) || 0) + Number(m.quantity || 0));
      });

      const tracked = products.filter((p) => (p as any).trackStock);
      const filtered = categoryFilter === 'all'
        ? tracked
        : tracked.filter((p) => p.category === categoryFilter);

      const result: LivroRow[] = filtered.map((p) => {
        const currentQty = Number((p as any).stockQuantity || 0);
        const delta = deltaAfter.get(p.id) || 0;
        const qtyAtDate = currentQty - delta;
        const unitCost = Number((p as any).costPrice || 0);
        return {
          id: p.id,
          code: (p as any).code || '',
          gtin: (p as any).gtin || '',
          name: p.name,
          category: p.category || '',
          unit: (p as any).unit || 'UN',
          ncm: (p as any).ncm || '',
          quantity: qtyAtDate,
          unit_cost: unitCost,
          total: qtyAtDate * unitCost,
        };
      });

      const finalRows = (includeZero === 'yes' ? result : result.filter((r) => Math.abs(r.quantity) > 0.0001))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      setRows(finalRows);
      setGeneratedAt(new Date());
      toast.success(`Livro gerado: ${finalRows.length} item(ns)`);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao gerar livro', { description: err?.message });
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    const totalItens = rows.length;
    const totalQtd = rows.reduce((s, r) => s + r.quantity, 0);
    const totalValor = rows.reduce((s, r) => s + r.total, 0);
    return { totalItens, totalQtd, totalValor };
  }, [rows]);

  async function exportExcel() {
    if (!rows.length) return;
    const XLSX = await import('xlsx');
    const header = [
      'Código', 'GTIN', 'NCM', 'Descrição', 'Categoria', 'Unidade',
      'Quantidade', 'Custo unitário (R$)', 'Valor total (R$)',
    ];
    const data = rows.map((r) => [
      r.code, r.gtin, r.ncm, r.name, r.category, r.unit,
      r.quantity, r.unit_cost, r.total,
    ]);
    data.push([]);
    data.push(['', '', '', '', '', 'TOTAIS', totals.totalQtd, '', totals.totalValor]);

    const ws = XLSX.utils.aoa_to_sheet([
      [`Livro de Registro de Inventário — ${company?.name || ''}`],
      [`Data de corte: ${format(new Date(cutoffDate + 'T00:00:00'), 'dd/MM/yyyy')}`],
      [`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
      [],
      header,
      ...data,
    ]);
    ws['!cols'] = [
      { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 42 }, { wch: 20 },
      { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
    XLSX.writeFile(wb, `livro-inventario-${cutoffDate}.xlsx`);
  }

  async function exportPDF() {
    if (!rows.length) return;
    const { jsPDF } = await import('jspdf');
    const autoTableMod: any = await import('jspdf-autotable');
    const autoTable = autoTableMod.default || autoTableMod;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const dtCorte = format(new Date(cutoffDate + 'T00:00:00'), 'dd/MM/yyyy');

    doc.setFontSize(14);
    doc.text('Livro de Registro de Inventário', 40, 40);
    doc.setFontSize(10);
    doc.text(company?.name || '', 40, 58);
    if ((company as any)?.cnpj) doc.text(`CNPJ: ${(company as any).cnpj}`, 40, 72);
    doc.text(`Data de corte: ${dtCorte}`, 40, 86);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 40, 100);

    autoTable(doc, {
      startY: 115,
      head: [['Código', 'GTIN', 'NCM', 'Descrição', 'Un.', 'Qtd.', 'Custo unit.', 'Valor total']],
      body: rows.map((r) => [
        r.code, r.gtin, r.ncm, r.name, r.unit,
        fmtQty(r.quantity),
        fmtMoney(r.unit_cost),
        fmtMoney(r.total),
      ]),
      foot: [[
        '', '', '', 'TOTAIS', '',
        fmtQty(totals.totalQtd), '', fmtMoney(totals.totalValor),
      ]],
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [51, 65, 85] },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
      columnStyles: {
        5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
      },
    });

    doc.save(`livro-inventario-${cutoffDate}.pdf`);
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
              <BookOpen className="w-6 h-6" />
              Livro de Registro de Inventário
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Relatório anual exigido pelo Simples Nacional. Gera o saldo dos produtos com controle de estoque em uma data de corte (tipicamente 31/12).
            </p>
          </div>
          <Badge variant="outline">Fase 2 — Estoque</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parâmetros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cutoff">Data de corte</Label>
                <Input
                  id="cutoff"
                  type="date"
                  value={cutoffDate}
                  onChange={(e) => setCutoffDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Saldo será calculado até o fim deste dia.</p>
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
                <Label>Itens sem saldo</Label>
                <Select value={includeZero} onValueChange={(v: any) => setIncludeZero(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Ocultar (padrão)</SelectItem>
                    <SelectItem value="yes">Incluir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={generate} disabled={loading || productsLoading} className="w-full">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookOpen className="w-4 h-4 mr-2" />}
                  Gerar livro
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O saldo é calculado a partir do estoque atual e rebobinado subtraindo as movimentações registradas após a data de corte. Custo unitário utilizado é o custo atual do cadastro (para maior fidelidade, feche uma contagem física próxima da data de corte).
            </p>
          </CardContent>
        </Card>

        {generatedAt && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base">Resultado</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Data de corte: {format(new Date(cutoffDate + 'T00:00:00'), 'dd/MM/yyyy')} • Gerado em {format(generatedAt, 'dd/MM/yyyy HH:mm')}
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
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Itens</div>
                  <div className="text-lg font-semibold">{totals.totalItens}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Quantidade total</div>
                  <div className="text-lg font-semibold">{fmtQty(totals.totalQtd)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Valor total</div>
                  <div className="text-lg font-semibold text-emerald-600">{fmtMoney(totals.totalValor)}</div>
                </div>
              </div>

              <Separator />

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Código</TableHead>
                      <TableHead className="w-32">GTIN</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-16">Un.</TableHead>
                      <TableHead className="w-24 text-right">Qtd.</TableHead>
                      <TableHead className="w-28 text-right">Custo unit.</TableHead>
                      <TableHead className="w-32 text-right">Valor total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                          Nenhum item para o filtro/data escolhida.
                        </TableCell>
                      </TableRow>
                    ) : rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell className="font-mono text-xs">{r.gtin}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          {r.category && <div className="text-xs text-muted-foreground">{r.category}</div>}
                        </TableCell>
                        <TableCell>{r.unit}</TableCell>
                        <TableCell className="text-right">{fmtQty(r.quantity)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(r.unit_cost)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(r.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}