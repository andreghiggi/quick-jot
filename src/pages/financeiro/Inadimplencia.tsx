import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertTriangle, Users, TrendingDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { useAuthContext } from '@/contexts/AuthContext';
import { useFinanceiroEnabled } from '@/hooks/useFinanceiroEnabled';
import { useAccountsReceivable, type AccountReceivable } from '@/hooks/useAccountsReceivable';
import { brl } from '@/components/pdv-v2/_format';

interface CustomerRow {
  key: string;
  name: string;
  phone: string | null;
  titles: number;
  total: number;
  maxDaysLate: number;
}

export default function Inadimplencia() {
  const navigate = useNavigate();
  const { company } = useAuthContext();
  const { enabled: finEnabled, loading: finLoading } = useFinanceiroEnabled(company?.id);
  const { items, loading } = useAccountsReceivable(company?.id);

  const [minDays, setMinDays] = useState<string>('1'); // >0
  const [minValue, setMinValue] = useState<string>('0');

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const daysLate = (dueDate: string): number => {
    const d = new Date(dueDate + 'T12:00:00');
    const t = new Date(todayStr + 'T12:00:00');
    return Math.floor((t.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  };

  const overdueTitles = useMemo<AccountReceivable[]>(() =>
    items.filter((i) => i.status === 'open' && i.due_date < todayStr),
  [items, todayStr]);

  const byCustomer = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, CustomerRow>();
    for (const t of overdueTitles) {
      const key = t.customer_id ?? `n:${(t.customer_name || '').toLowerCase()}|${t.customer_phone ?? ''}`;
      const existing = map.get(key);
      const late = daysLate(t.due_date);
      if (existing) {
        existing.titles += 1;
        existing.total += Number(t.balance);
        if (late > existing.maxDaysLate) existing.maxDaysLate = late;
      } else {
        map.set(key, {
          key,
          name: t.customer_name || 'Sem nome',
          phone: t.customer_phone ?? null,
          titles: 1,
          total: Number(t.balance),
          maxDaysLate: late,
        });
      }
    }
    const min = Number(minDays) || 0;
    const minVal = Number(minValue) || 0;
    return Array.from(map.values())
      .filter((r) => r.maxDaysLate >= min && r.total >= minVal)
      .sort((a, b) => b.total - a.total);
  }, [overdueTitles, minDays, minValue]);

  const totalGeral = byCustomer.reduce((s, r) => s + r.total, 0);
  const ticket = byCustomer.length ? totalGeral / byCustomer.length : 0;

  if (finLoading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!finEnabled) return <Navigate to="/" replace />;

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Inadimplência</h1>
          <p className="text-sm text-muted-foreground">
            Clientes com títulos de crediário vencidos e ainda em aberto.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard label="Total inadimplente" value={brl(totalGeral)} icon={AlertTriangle} tone="destructive" />
        <MetricCard label="Clientes em atraso" value={String(byCustomer.length)} icon={Users} tone="default" />
        <MetricCard label="Ticket médio" value={brl(ticket)} icon={TrendingDown} tone="muted" />
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Atraso mínimo</Label>
            <Select value={minDays} onValueChange={setMinDays}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 dia ou mais</SelectItem>
                <SelectItem value="15">15 dias ou mais</SelectItem>
                <SelectItem value="30">30 dias ou mais</SelectItem>
                <SelectItem value="60">60 dias ou mais</SelectItem>
                <SelectItem value="90">90 dias ou mais</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Valor pendente mínimo (R$)</Label>
            <Input
              type="number"
              min={0}
              value={minValue}
              onChange={(e) => setMinValue(e.target.value)}
              className="w-[160px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Clientes em atraso</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : byCustomer.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nenhum cliente inadimplente com esses filtros.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Títulos</TableHead>
                  <TableHead className="text-right">Total pendente</TableHead>
                  <TableHead className="text-right">Maior atraso</TableHead>
                  <TableHead className="text-right">Risco</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCustomer.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.phone || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.titles}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-destructive">{brl(r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.maxDaysLate} dias</TableCell>
                    <TableCell className="text-right">
                      <RiskBadge days={r.maxDaysLate} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Para ver e receber os títulos individualmente, acesse{' '}
        <button className="underline hover:text-foreground" onClick={() => navigate('/financeiro/contas-a-receber')}>Contas a Receber</button>.
      </div>
    </div>
  );
}

function RiskBadge({ days }: { days: number }) {
  if (days >= 60) return <Badge variant="destructive">Alto</Badge>;
  if (days >= 30) return <Badge className="bg-amber-500 hover:bg-amber-500">Médio</Badge>;
  return <Badge variant="outline">Baixo</Badge>;
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: 'default' | 'destructive' | 'muted' }) {
  const toneClass =
    tone === 'destructive' ? 'text-destructive' :
    tone === 'muted'       ? 'text-muted-foreground' :
                             'text-foreground';
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}