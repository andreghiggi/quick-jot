import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { History, FileSpreadsheet, FileText, Loader2, Check, ChevronsUpDown } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';

function fmtQty(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
function fmtSigned(v: number) {
  const s = fmtQty(Math.abs(v));
  return v > 0 ? `+${s}` : v < 0 ? `-${s}` : s;
}
function fmtDateTime(iso: string) {
  try { return format(new Date(iso), 'dd/MM/yyyy HH:mm'); } catch { return iso; }
}

const TYPE_LABEL: Record<string, string> = {
  sale: 'Venda',
  manual_in: 'Entrada manual',
  manual_out: 'Saída manual',
  adjustment: 'Ajuste',
  purchase: 'Compra (XML)',
  return: 'Devolução',
  transfer_in: 'Transferência (entrada)',
  transfer_out: 'Transferência (saída)',
  loss: 'Perda/Quebra',
};
function labelType(t: string) { return TYPE_LABEL[t] || t; }

const REF_LABEL: Record<string, string> = {
  pdv_sale: 'PDV/Frente de Caixa',
  order: 'Cardápio online',
  inventory_count: 'Contagem de inventário',
  purchase_invoice: 'Nota de compra',
  manual: 'Lançamento manual',
};
function labelRef(r?: string | null) { return r ? (REF_LABEL[r] || r) : '—'; }

interface KardexRow {
  id: string;
  created_at: string;
  type: string;
  quantity: number;
  balance_after: number | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function InventarioKardex() {
  const { company } = useAuthContext();
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);
  const { products, loading: productsLoading } = useProducts({ companyId: company?.id });

  const [productId, setProductId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth());
  const [dateTo, setDateTo] = useState<string>(today());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<KardexRow[]>([]);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [comboOpen, setComboOpen] = useState(false);

  const trackedProducts = useMemo(
    () => products.filter((p) => (p as any).trackStock).sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  const selectedProduct = useMemo(
    () => trackedProducts.find((p) => p.id === productId) || null,
    [trackedProducts, productId],
  );

  async function generate() {
    if (!company?.id) return;
    if (!productId) { toast.error('Selecione um produto'); return; }
    if (!dateFrom || !dateTo) { toast.error('Informe o período'); return; }
    if (dateFrom > dateTo) { toast.error('Data inicial maior que a final'); return; }

    setLoading(true);
    try {
      const fromIso = `${dateFrom}T00:00:00-03:00`;
      const toIso = `${dateTo}T23:59:59-03:00`;

      // Movimentos dentro do período (ordenados)
      const { data: movsIn, error: e1 } = await (supabase as any)
        .from('stock_movements')
        .select('id, created_at, type, quantity, balance_after, reference_type, reference_id, notes')
        .eq('company_id', company.id)
        .eq('product_id', productId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: true });
      if (e1) throw e1;

      const filtered = (movsIn || []).filter((m: any) => typeFilter === 'all' || m.type === typeFilter);

      // Saldo atual do cadastro
      const currentQty = Number((selectedProduct as any)?.stockQuantity || 0);

      // Rebobinar do saldo atual: subtrai movimentações POSTERIORES a dateTo
      const { data: movsAfter, error: e2 } = await (supabase as any)
        .from('stock_movements')
        .select('quantity')
        .eq('company_id', company.id)
        .eq('product_id', productId)
        .gt('created_at', toIso);
      if (e2) throw e2;
      const deltaAfter = (movsAfter || []).reduce((s: number, m: any) => s + Number(m.quantity || 0), 0);
      const balanceAtEnd = currentQty - deltaAfter;

      // Delta dentro do período (todos os tipos, para deduzir o saldo inicial)
      const deltaInPeriod = (movsIn || []).reduce((s: number, m: any) => s + Number(m.quantity || 0), 0);
      const opening = balanceAtEnd - deltaInPeriod;

      setOpeningBalance(opening);
      setCurrentBalance(currentQty);

      // Calcula saldo após cada movimento (partindo do opening)
      let running = opening;
      const withBalance: KardexRow[] = (movsIn || []).map((m: any) => {
        running += Number(m.quantity || 0);
        return {
          id: m.id,
          created_at: m.created_at,
          type: m.type,
          quantity: Number(m.quantity || 0),
          balance_after: m.balance_after != null ? Number(m.balance_after) : running,
          reference_type: m.reference_type,
          reference_id: m.reference_id,
          notes: m.notes,
        };
      });

      // Aplica filtro de tipo apenas na exibição, preservando saldos corretos
      const displayed = typeFilter === 'all'
        ? withBalance
        : withBalance.filter((r) => r.type === typeFilter);

      setRows(displayed);
      setGeneratedAt(new Date());
      if (!filtered.length) toast.info('Nenhuma movimentação no período/filtro.');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao gerar Kardex: ' + (err.message || 'desconhecido'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setRows([]); setGeneratedAt(null); }, [productId, dateFrom, dateTo, typeFilter]);

  const totals = useMemo(() => {
    const entradas = rows.filter((r) => r.quantity > 0).reduce((s, r) => s + r.quantity, 0);
    const saidas = rows.filter((r) => r.quantity < 0).reduce((s, r) => s + Math.abs(r.quantity), 0);
    return { entradas, saidas };
  }, [rows]);

  async function exportExcel() {
    if (!rows.length || !selectedProduct) return;
    const XLSX = await import('xlsx');
    const header = ['Data/Hora', 'Tipo', 'Origem', 'Quantidade', 'Saldo após', 'Observação'];
    const data = rows.map((r) => [
      fmtDateTime(r.created_at), labelType(r.type), labelRef(r.reference_type),
      r.quantity, r.balance_after ?? '', r.notes || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([
      [`Kardex — ${selectedProduct.name}`],
      [`Empresa: ${company?.name || ''}`],
      [`Período: ${format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy')} a ${format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy')}`],
      [`Saldo inicial: ${fmtQty(openingBalance)}   Entradas: +${fmtQty(totals.entradas)}   Saídas: -${fmtQty(totals.saidas)}   Saldo atual: ${fmtQty(currentBalance)}`],
      [`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
      [],
      header,
      ...data,
    ]);
    ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kardex');
    XLSX.writeFile(wb, `kardex-${selectedProduct.name.replace(/[^\w]+/g, '_')}-${dateFrom}_a_${dateTo}.xlsx`);
  }

  async function exportPDF() {
    if (!rows.length || !selectedProduct) return;
    const { jsPDF } = await import('jspdf');
    const autoTableMod: any = await import('jspdf-autotable');
    const autoTable = autoTableMod.default || autoTableMod;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Kardex por Produto', 40, 40);
    doc.setFontSize(10);
    doc.text(company?.name || '', 40, 58);
    doc.text(`Produto: ${selectedProduct.name}`, 40, 72);
    doc.text(`Período: ${format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy')} a ${format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy')}`, 40, 86);
    doc.text(`Saldo inicial: ${fmtQty(openingBalance)}   Entradas: +${fmtQty(totals.entradas)}   Saídas: -${fmtQty(totals.saidas)}   Saldo atual: ${fmtQty(currentBalance)}`, 40, 100);

    autoTable(doc, {
      startY: 115,
      head: [['Data/Hora', 'Tipo', 'Origem', 'Qtd.', 'Saldo após', 'Observação']],
      body: rows.map((r) => [
        fmtDateTime(r.created_at), labelType(r.type), labelRef(r.reference_type),
        fmtSigned(r.quantity), r.balance_after != null ? fmtQty(r.balance_after) : '—',
        r.notes || '',
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [51, 65, 85] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
    doc.save(`kardex-${selectedProduct.name.replace(/[^\w]+/g, '_')}-${dateFrom}_a_${dateTo}.pdf`);
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
              <History className="w-6 h-6" />
              Kardex por Produto
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Histórico cronológico de entradas, saídas e ajustes de um produto, com saldo acumulado após cada movimento.
            </p>
          </div>
          <Badge variant="outline">Fase 4 — Estoque</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parâmetros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Produto</Label>
                <Popover open={comboOpen} onOpenChange={setComboOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      <span className="truncate">
                        {selectedProduct ? selectedProduct.name : 'Selecione um produto…'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar por nome, código ou GTIN…" />
                      <CommandList>
                        <CommandEmpty>Nenhum produto com controle de estoque.</CommandEmpty>
                        <CommandGroup>
                          {trackedProducts.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={`${p.name} ${(p as any).code || ''} ${(p as any).gtin || ''}`}
                              onSelect={() => { setProductId(p.id); setComboOpen(false); }}
                            >
                              <Check className={cn('mr-2 h-4 w-4', productId === p.id ? 'opacity-100' : 'opacity-0')} />
                              <div className="flex flex-col">
                                <span>{p.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {(p as any).code || 's/ código'} • {(p as any).gtin || 's/ GTIN'} • Saldo: {fmtQty(Number((p as any).stockQuantity || 0))}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>De</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Até</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de movimento</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="sale">Venda</SelectItem>
                    <SelectItem value="manual_in">Entrada manual</SelectItem>
                    <SelectItem value="manual_out">Saída manual</SelectItem>
                    <SelectItem value="adjustment">Ajuste</SelectItem>
                    <SelectItem value="purchase">Compra (XML)</SelectItem>
                    <SelectItem value="return">Devolução</SelectItem>
                    <SelectItem value="loss">Perda/Quebra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={generate} disabled={loading || productsLoading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <History className="w-4 h-4 mr-2" />}
                Gerar Kardex
              </Button>
            </div>
          </CardContent>
        </Card>

        {generatedAt && selectedProduct && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base">{selectedProduct.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy')} a {format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy')} • Gerado em {format(generatedAt, 'dd/MM/yyyy HH:mm')}
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Saldo inicial</div>
                  <div className="text-lg font-semibold">{fmtQty(openingBalance)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Entradas</div>
                  <div className="text-lg font-semibold text-emerald-600">+{fmtQty(totals.entradas)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Saídas</div>
                  <div className="text-lg font-semibold text-red-600">-{fmtQty(totals.saidas)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Saldo atual</div>
                  <div className="text-lg font-semibold">{fmtQty(currentBalance)}</div>
                </div>
              </div>

              <Separator />

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Data/Hora</TableHead>
                      <TableHead className="w-36">Tipo</TableHead>
                      <TableHead className="w-40">Origem</TableHead>
                      <TableHead className="w-28 text-right">Quantidade</TableHead>
                      <TableHead className="w-28 text-right">Saldo após</TableHead>
                      <TableHead>Observação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                          Nenhuma movimentação no período/filtro.
                        </TableCell>
                      </TableRow>
                    ) : rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{fmtDateTime(r.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">{labelType(r.type)}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{labelRef(r.reference_type)}</TableCell>
                        <TableCell className={cn('text-right font-medium', r.quantity > 0 ? 'text-emerald-600' : r.quantity < 0 ? 'text-red-600' : '')}>
                          {fmtSigned(r.quantity)}
                        </TableCell>
                        <TableCell className="text-right">{r.balance_after != null ? fmtQty(r.balance_after) : '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.notes || ''}</TableCell>
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