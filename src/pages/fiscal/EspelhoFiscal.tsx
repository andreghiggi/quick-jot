import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { BookMarked, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Modelo = '65' | '55';
type StatusFiltro = 'todos' | 'autorizada' | 'cancelada';

interface Row {
  id: string;
  modelo: Modelo;
  dataEmissao: string; // ISO
  numero: string;
  serie: string;
  chave: string;
  valor: number;
  cfop: string;
  natureza: string;
  pagamento: string;
  status: 'autorizada' | 'cancelada';
}

function extractCfopsFromPayload(payload: any): string[] {
  if (!payload) return [];
  const itens =
    payload?.itens ||
    payload?.items ||
    payload?.produtos ||
    payload?.nfce?.itens ||
    payload?.nfe?.itens ||
    [];
  const set = new Set<string>();
  if (Array.isArray(itens)) {
    for (const it of itens) {
      const c = it?.cfop || it?.CFOP || it?.icms?.cfop || it?.produto?.cfop;
      if (c) set.add(String(c));
    }
  }
  return Array.from(set);
}

export default function EspelhoFiscal() {
  const { company } = useAuthContext();

  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth());
  const [dateTo, setDateTo] = useState<string>(today());
  const [modelo, setModelo] = useState<'todos' | Modelo>('todos');
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todos');
  const [serie, setSerie] = useState<string>('todas');

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [seriesDisponiveis, setSeriesDisponiveis] = useState<string[]>([]);

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
      const wantStatus = statusFiltro === 'todos' ? ['autorizada', 'cancelada'] : [statusFiltro];

      const collected: Row[] = [];

      // NFC-e (modelo 65)
      if (modelo === 'todos' || modelo === '65') {
        const { data, error } = await (supabase as any)
          .from('nfce_records')
          .select('id, sale_id, numero, serie, chave_acesso, valor_total, status, created_at, request_payload')
          .eq('company_id', company.id)
          .in('status', wantStatus)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: true });
        if (error) throw error;

        // pagamentos por sale_id
        const saleIds = (data || []).map((r: any) => r.sale_id).filter(Boolean);
        const pagPorVenda = new Map<string, string>();
        if (saleIds.length) {
          const { data: pags } = await (supabase as any)
            .from('pdv_sale_payments')
            .select('sale_id, payment_method_name, amount')
            .in('sale_id', saleIds);
          const acc = new Map<string, string[]>();
          for (const p of pags || []) {
            const list = acc.get(p.sale_id) || [];
            list.push(p.payment_method_name || '—');
            acc.set(p.sale_id, list);
          }
          for (const [sid, list] of acc) {
            pagPorVenda.set(sid, Array.from(new Set(list)).join(' + '));
          }

          // Fallback: vendas single-payment não têm split — usa payment_method da pdv_sales
          const semSplit = saleIds.filter((sid: string) => !pagPorVenda.has(sid));
          if (semSplit.length) {
            const { data: sales } = await (supabase as any)
              .from('pdv_sales')
              .select('id, payment_method_id')
              .in('id', semSplit);
            const pmIds = Array.from(
              new Set((sales || []).map((s: any) => s.payment_method_id).filter(Boolean)),
            );
            const pmMap = new Map<string, string>();
            if (pmIds.length) {
              const { data: pms } = await (supabase as any)
                .from('payment_methods')
                .select('id, name')
                .in('id', pmIds);
              for (const pm of pms || []) pmMap.set(pm.id, pm.name);
            }
            for (const s of sales || []) {
              const nome = s.payment_method_id ? pmMap.get(s.payment_method_id) : null;
              if (nome) pagPorVenda.set(s.id, nome);
            }
          }
        }

        for (const r of data || []) {
          const cfops = extractCfopsFromPayload(r.request_payload);
          collected.push({
            id: r.id,
            modelo: '65',
            dataEmissao: r.created_at,
            numero: r.numero || '—',
            serie: r.serie || '—',
            chave: r.chave_acesso || '',
            valor: Number(r.valor_total || 0),
            cfop: cfops.join(', ') || '—',
            natureza: cfops.length > 0 ? 'Venda de mercadoria' : '—',
            pagamento: pagPorVenda.get(r.sale_id) || '—',
            status: r.status as 'autorizada' | 'cancelada',
          });
        }
      }

      // NF-e (modelo 55)
      if (modelo === 'todos' || modelo === '55') {
        const { data, error } = await (supabase as any)
          .from('nfe_records')
          .select('id, numero, serie, chave_acesso, valor_total, status, created_at, natureza_operacao, request_payload')
          .eq('company_id', company.id)
          .in('status', wantStatus)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: true });
        if (error) throw error;

        for (const r of data || []) {
          const cfops = extractCfopsFromPayload(r.request_payload);
          collected.push({
            id: r.id,
            modelo: '55',
            dataEmissao: r.created_at,
            numero: r.numero || '—',
            serie: r.serie || '—',
            chave: r.chave_acesso || '',
            valor: Number(r.valor_total || 0),
            cfop: cfops.join(', ') || '—',
            natureza: r.natureza_operacao || '—',
            pagamento: '—', // NF-e não tem vínculo direto com pdv_sale_payments
            status: r.status as 'autorizada' | 'cancelada',
          });
        }
      }

      collected.sort((a, b) => (a.dataEmissao < b.dataEmissao ? -1 : 1));
      setRows(collected);
      setSeriesDisponiveis(Array.from(new Set(collected.map((r) => r.serie))).sort());
      setGeneratedAt(new Date());
    } catch (err: any) {
      console.error('[EspelhoFiscal] erro:', err);
      toast.error('Falha ao gerar espelho', { description: err?.message });
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    if (serie === 'todas') return rows;
    return rows.filter((r) => r.serie === serie);
  }, [rows, serie]);

  const totals = useMemo(() => {
    let qtdAut = 0, qtdCanc = 0, somaAut = 0, somaCanc = 0;
    const porCfop = new Map<string, { qtd: number; valor: number }>();
    const porPag = new Map<string, { qtd: number; valor: number }>();
    for (const r of filteredRows) {
      if (r.status === 'autorizada') { qtdAut++; somaAut += r.valor; }
      else { qtdCanc++; somaCanc += r.valor; }
      const c = r.cfop || '—';
      const cAcc = porCfop.get(c) || { qtd: 0, valor: 0 };
      cAcc.qtd += 1; cAcc.valor += r.status === 'autorizada' ? r.valor : 0;
      porCfop.set(c, cAcc);
      const p = r.pagamento || '—';
      const pAcc = porPag.get(p) || { qtd: 0, valor: 0 };
      pAcc.qtd += 1; pAcc.valor += r.status === 'autorizada' ? r.valor : 0;
      porPag.set(p, pAcc);
    }
    return { qtdAut, qtdCanc, somaAut, somaCanc, porCfop, porPag };
  }, [filteredRows]);

  async function exportExcel() {
    if (!filteredRows.length) return;
    const XLSX = await import('xlsx');
    const header = ['Data', 'Modelo', 'Nº', 'Série', 'Chave de Acesso', 'CFOP', 'Natureza', 'Pagamento', 'Valor', 'Status'];
    const data = filteredRows.map((r) => [
      format(new Date(r.dataEmissao), 'dd/MM/yyyy HH:mm'),
      r.modelo,
      r.numero,
      r.serie,
      r.chave,
      r.cfop,
      r.natureza,
      r.pagamento,
      r.valor,
      r.status === 'autorizada' ? 'Autorizada' : 'Cancelada',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([
      [`Espelho Fiscal — ${company?.name || ''}`],
      [`Período: ${format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy')} a ${format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy')}`],
      [`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
      [],
      header,
      ...data,
      [],
      ['Totais'],
      ['Autorizadas', totals.qtdAut, '', '', '', '', '', '', totals.somaAut],
      ['Canceladas', totals.qtdCanc, '', '', '', '', '', '', totals.somaCanc],
    ]);
    ws['!cols'] = [
      { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 48 },
      { wch: 16 }, { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Espelho Fiscal');
    XLSX.writeFile(wb, `espelho-fiscal-${dateFrom}-a-${dateTo}.xlsx`);
  }

  async function exportPDF() {
    if (!filteredRows.length) return;
    const { jsPDF } = await import('jspdf');
    const autoTableMod: any = await import('jspdf-autotable');
    const autoTable = autoTableMod.default || autoTableMod;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Espelho Fiscal', 40, 40);
    doc.setFontSize(10);
    doc.text(company?.name || '', 40, 58);
    if ((company as any)?.cnpj) doc.text(`CNPJ: ${(company as any).cnpj}`, 40, 72);
    doc.text(
      `Período: ${format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy')} a ${format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy')}`,
      40, 86,
    );
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 40, 100);

    autoTable(doc, {
      startY: 115,
      head: [['Data', 'Mod.', 'Nº', 'Sér.', 'Chave', 'CFOP', 'Natureza', 'Pagamento', 'Valor', 'Status']],
      body: filteredRows.map((r) => [
        format(new Date(r.dataEmissao), 'dd/MM/yy HH:mm'),
        r.modelo,
        r.numero,
        r.serie,
        r.chave,
        r.cfop,
        r.natureza,
        r.pagamento,
        fmtMoney(r.valor),
        r.status === 'autorizada' ? 'AUT' : 'CANC',
      ]),
      foot: [[
        '', '', '', '', '', '', '',
        `Autoriz.: ${totals.qtdAut}  Canc.: ${totals.qtdCanc}`,
        fmtMoney(totals.somaAut),
        '',
      ]],
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [51, 65, 85] },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
      columnStyles: {
        4: { cellWidth: 200, font: 'courier', fontSize: 6 },
        8: { halign: 'right' },
      },
    });

    doc.save(`espelho-fiscal-${dateFrom}-a-${dateTo}.pdf`);
  }

  useEffect(() => {
    // primeira geração automática
    if (company?.id && !generatedAt) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookMarked className="w-6 h-6" />
              Espelho Fiscal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Relatório consolidado de notas emitidas (NFC-e modelo 65 e NF-e modelo 55) para entrega à contabilidade.
            </p>
          </div>
          <Badge variant="outline">Fiscal</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-1.5">
                <Label>De</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Até</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Modelo</Label>
                <Select value={modelo} onValueChange={(v: any) => setModelo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos (55 + 65)</SelectItem>
                    <SelectItem value="65">NFC-e (65)</SelectItem>
                    <SelectItem value="55">NF-e (55)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={statusFiltro} onValueChange={(v: any) => setStatusFiltro(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Autorizada + Cancelada</SelectItem>
                    <SelectItem value="autorizada">Somente autorizadas</SelectItem>
                    <SelectItem value="cancelada">Somente canceladas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Série</Label>
                <Select value={serie} onValueChange={setSerie}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {seriesDisponiveis.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={generate} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                  Gerar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {generatedAt && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base">Resultado</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {filteredRows.length} nota(s) • Gerado em {format(generatedAt, 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportPDF} disabled={!filteredRows.length}>
                  <FileText className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filteredRows.length}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Autorizadas</div>
                  <div className="text-lg font-semibold">{totals.qtdAut}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Valor autorizadas</div>
                  <div className="text-lg font-semibold text-emerald-600">{fmtMoney(totals.somaAut)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Canceladas</div>
                  <div className="text-lg font-semibold">{totals.qtdCanc}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Valor canceladas</div>
                  <div className="text-lg font-semibold text-destructive">{fmtMoney(totals.somaCanc)}</div>
                </div>
              </div>

              {(totals.porCfop.size > 0 || totals.porPag.size > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Por CFOP (valor autorizado)</div>
                    <div className="space-y-1 text-sm">
                      {Array.from(totals.porCfop.entries()).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="font-mono">{k}</span>
                          <span>{v.qtd} nota(s) • <strong>{fmtMoney(v.valor)}</strong></span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Por forma de pagamento (valor autorizado)</div>
                    <div className="space-y-1 text-sm">
                      {Array.from(totals.porPag.entries()).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span>{k}</span>
                          <span>{v.qtd} nota(s) • <strong>{fmtMoney(v.valor)}</strong></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Data</TableHead>
                      <TableHead className="w-16">Mod.</TableHead>
                      <TableHead className="w-20">Nº</TableHead>
                      <TableHead className="w-16">Sér.</TableHead>
                      <TableHead>Chave de Acesso</TableHead>
                      <TableHead className="w-24">CFOP</TableHead>
                      <TableHead>Natureza</TableHead>
                      <TableHead className="w-32">Pagamento</TableHead>
                      <TableHead className="w-28 text-right">Valor</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                          Nenhuma nota encontrada para o filtro escolhido.
                        </TableCell>
                      </TableRow>
                    ) : filteredRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{format(new Date(r.dataEmissao), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell><Badge variant="outline">{r.modelo}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                        <TableCell className="font-mono text-xs">{r.serie}</TableCell>
                        <TableCell className="font-mono text-[10px] break-all">
                          <div className="flex items-center gap-1">
                            <span>{r.chave || '—'}</span>
                            {r.chave && (
                              <button
                                type="button"
                                className="text-primary hover:underline text-[10px]"
                                onClick={() => {
                                  navigator.clipboard.writeText(r.chave);
                                  toast.success('Chave copiada');
                                }}
                              >
                                copiar
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.cfop}</TableCell>
                        <TableCell className="text-xs">{r.natureza}</TableCell>
                        <TableCell className="text-xs">{r.pagamento}</TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(r.valor)}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'autorizada' ? 'default' : 'destructive'}>
                            {r.status === 'autorizada' ? 'Autorizada' : 'Cancelada'}
                          </Badge>
                        </TableCell>
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