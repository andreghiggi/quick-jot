import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CreditCard, CalendarIcon, Download, Loader2, RefreshCw, Printer, XCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseTefDataFromNotes, isOrderTefCancelled, reimprimirComprovanteTef } from '@/utils/tefOrderActions';
import { toast } from 'sonner';

type PeriodPreset = 'today' | 'week' | 'month' | 'last_month' | 'custom';

interface TefTxRow {
  id: string;
  order_code: string;
  created_at: string;
  total: number;
  customer_name: string;
  notes: string | null;
  // parsed
  type: 'pinpad' | 'smartpos';
  nsu: string;
  authCode: string;
  cardBrand: string;
  acquirer: string;
  operationType?: string;
  cancelled: boolean;
  hasReceipt: boolean;
}

function getPresetRange(p: PeriodPreset): { start: Date; end: Date } {
  const now = new Date();
  switch (p) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_month': {
      const lm = subMonths(now, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    default: return { start: startOfDay(now), end: endOfDay(now) };
  }
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function TefReport() {
  const { company } = useAuthContext();
  const [preset, setPreset] = useState<PeriodPreset>('today');
  const [customStart, setCustomStart] = useState<Date | undefined>(new Date());
  const [customEnd, setCustomEnd] = useState<Date | undefined>(new Date());
  const [acquirerFilter, setAcquirerFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'cancelled'>('all');
  const [opTypeFilter, setOpTypeFilter] = useState<string>('all');

  const range = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { start: startOfDay(customStart), end: endOfDay(customEnd) };
    }
    return getPresetRange(preset);
  }, [preset, customStart, customEnd]);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['tef-report', company?.id, range.start.toISOString(), range.end.toISOString()],
    queryFn: async (): Promise<TefTxRow[]> => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code, created_at, total, customer_name, notes')
        .eq('company_id', company.id)
        .gte('created_at', range.start.toISOString())
        .lte('created_at', range.end.toISOString())
        .or('notes.ilike.%TEF PinPad:%,notes.ilike.%TEF: NSU%')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('TEF report fetch error:', error);
        return [];
      }

      const result: TefTxRow[] = [];
      for (const o of data ?? []) {
        const tef = parseTefDataFromNotes(o.notes);
        if (!tef) continue;
        result.push({
          id: o.id,
          order_code: o.order_code,
          created_at: o.created_at,
          total: Number(o.total) || 0,
          customer_name: o.customer_name,
          notes: o.notes,
          type: tef.type,
          nsu: tef.nsu,
          authCode: tef.authCode,
          cardBrand: tef.cardBrand,
          acquirer: tef.acquirer,
          operationType: tef.operationType,
          cancelled: isOrderTefCancelled(o.notes),
          hasReceipt: !!tef.receipt,
        });
      }
      return result;
    },
    enabled: !!company?.id,
  });

  const acquirerOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.acquirer).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);
  const brandOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.cardBrand).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);
  const opTypeOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.operationType).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (acquirerFilter !== 'all' && r.acquirer !== acquirerFilter) return false;
      if (brandFilter !== 'all' && r.cardBrand !== brandFilter) return false;
      if (opTypeFilter !== 'all' && r.operationType !== opTypeFilter) return false;
      if (statusFilter === 'approved' && r.cancelled) return false;
      if (statusFilter === 'cancelled' && !r.cancelled) return false;
      return true;
    });
  }, [rows, acquirerFilter, brandFilter, opTypeFilter, statusFilter]);

  const totals = useMemo(() => {
    const approved = filtered.filter((r) => !r.cancelled);
    const cancelled = filtered.filter((r) => r.cancelled);
    const sum = (arr: TefTxRow[]) => arr.reduce((s, r) => s + r.total, 0);
    return {
      total: filtered.length,
      approvedCount: approved.length,
      cancelledCount: cancelled.length,
      gross: sum(approved),
      reversed: sum(cancelled),
      net: sum(approved) - sum(cancelled),
    };
  }, [filtered]);

  const handleExportCSV = () => {
    if (!filtered.length) {
      toast.error('Nenhuma transação para exportar');
      return;
    }
    const header = ['Pedido', 'Data/Hora', 'NSU', 'Autorização', 'Bandeira', 'Adquirente', 'Operação', 'Tipo', 'Cliente', 'Valor', 'Status'];
    const lines = filtered.map((r) => [
      r.order_code,
      format(new Date(r.created_at), 'dd/MM/yyyy HH:mm:ss'),
      r.nsu,
      r.authCode,
      r.cardBrand,
      r.acquirer,
      r.operationType ?? '',
      r.type === 'pinpad' ? 'PinPad' : 'SmartPOS',
      r.customer_name,
      r.total.toFixed(2).replace('.', ','),
      r.cancelled ? 'Cancelada' : 'Aprovada',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    const csv = '\uFEFF' + [header.join(';'), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-tef-${format(range.start, 'yyyyMMdd')}-${format(range.end, 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <CreditCard className="w-7 h-7 text-primary" />
              Relatório TEF
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Transações consolidadas de pagamento por máquina (PinPad / SmartPOS).
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
            <Button size="sm" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Período</label>
                <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="week">Esta semana</SelectItem>
                    <SelectItem value="month">Este mês</SelectItem>
                    <SelectItem value="last_month">Mês anterior</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {preset === 'custom' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">De</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !customStart && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customStart ? format(customStart, 'dd/MM/yyyy') : 'Início'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customStart} onSelect={setCustomStart} initialFocus className={cn('p-3 pointer-events-auto')} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Até</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !customEnd && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customEnd ? format(customEnd, 'dd/MM/yyyy') : 'Fim'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} initialFocus className={cn('p-3 pointer-events-auto')} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Adquirente</label>
                <Select value={acquirerFilter} onValueChange={setAcquirerFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {acquirerOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Bandeira</label>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {brandOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Operação</label>
                <Select value={opTypeFilter} onValueChange={setOpTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {opTypeOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="approved">Aprovadas</SelectItem>
                    <SelectItem value="cancelled">Canceladas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              Período: <strong>{format(range.start, "dd 'de' MMMM yyyy", { locale: ptBR })}</strong> até <strong>{format(range.end, "dd 'de' MMMM yyyy", { locale: ptBR })}</strong>
            </p>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Transações</p>
            <p className="text-2xl font-bold">{totals.total}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Aprovadas</p>
            <p className="text-2xl font-bold text-emerald-600">{totals.approvedCount}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Canceladas</p>
            <p className="text-2xl font-bold text-destructive">{totals.cancelledCount}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Valor Bruto</p>
            <p className="text-xl font-bold text-emerald-600">{fmtBRL(totals.gross)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Valor Líquido</p>
            <p className="text-xl font-bold">{fmtBRL(totals.net)}</p>
            <p className="text-[10px] text-muted-foreground">- {fmtBRL(totals.reversed)} estornado</p>
          </CardContent></Card>
        </div>

        {/* Tabela */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Transações</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Nenhuma transação TEF encontrada para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>NSU</TableHead>
                      <TableHead>Aut.</TableHead>
                      <TableHead>Bandeira</TableHead>
                      <TableHead>Adquirente</TableHead>
                      <TableHead>Operação</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id} className={cn(r.cancelled && 'opacity-60')}>
                        <TableCell className="font-mono text-xs">#{r.order_code}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at), 'dd/MM HH:mm:ss')}</TableCell>
                        <TableCell className="font-mono text-xs">{r.nsu}</TableCell>
                        <TableCell className="font-mono text-xs">{r.authCode}</TableCell>
                        <TableCell className="text-xs">{r.cardBrand}</TableCell>
                        <TableCell className="text-xs">{r.acquirer || '—'}</TableCell>
                        <TableCell className="text-xs">{r.operationType || '—'}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600 whitespace-nowrap">
                          {fmtBRL(r.total)}
                        </TableCell>
                        <TableCell>
                          {r.cancelled ? (
                            <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Cancelada</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> Aprovada</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.hasReceipt && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => reimprimirComprovanteTef(r.notes, r.order_code)}
                              title="Reimprimir comprovante"
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
