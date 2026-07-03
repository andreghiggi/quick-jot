import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, Wallet, LineChart } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { useAuthContext } from '@/contexts/AuthContext';
import { useFinanceiroEnabled } from '@/hooks/useFinanceiroEnabled';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { brl } from '@/components/pdv-v2/_format';

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function lastDayOfMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

export default function FluxoCaixa() {
  const navigate = useNavigate();
  const { company } = useAuthContext();
  const { enabled: finEnabled, loading: finLoading } = useFinanceiroEnabled(company?.id);

  const [start, setStart] = useState(firstDayOfMonth());
  const [end, setEnd] = useState(lastDayOfMonth());
  const [includeProjected, setIncludeProjected] = useState(true);

  const { daily, totals, loading } = useFluxoCaixa(company?.id, start, end);

  const rows = useMemo(() =>
    // esconde dias 100% zerados quando não pediu previsto
    daily.filter((d) => includeProjected
      ? true
      : (d.entradas_realizadas || d.saidas_realizadas)),
  [daily, includeProjected]);

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
          <h1 className="text-2xl font-semibold">Fluxo de Caixa</h1>
          <p className="text-sm text-muted-foreground">
            Entradas e saídas consolidadas do período (vendas, recebimentos de crediário e contas a pagar).
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Início</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-[160px]" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-[160px]" />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch checked={includeProjected} onCheckedChange={setIncludeProjected} id="proj" />
            <Label htmlFor="proj" className="text-sm cursor-pointer">Incluir valores previstos</Label>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Entradas realizadas" value={totals.entradas_realizadas} icon={TrendingUp} tone="success" />
        <MetricCard label="Saídas realizadas"   value={totals.saidas_realizadas}   icon={TrendingDown} tone="destructive" />
        <MetricCard label="Saldo realizado"     value={totals.saldo_realizado}     icon={Wallet} tone={totals.saldo_realizado >= 0 ? 'success' : 'destructive'} />
        <MetricCard label="Saldo projetado"     value={totals.saldo_projetado}     icon={LineChart} tone={totals.saldo_projetado >= 0 ? 'default' : 'destructive'} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento diário</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Sem movimentações no período.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                  {includeProjected && <TableHead className="text-right">Previsto (E)</TableHead>}
                  {includeProjected && <TableHead className="text-right">Previsto (S)</TableHead>}
                  <TableHead className="text-right">Saldo dia</TableHead>
                  <TableHead className="text-right">Acumulado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{d.date.split('-').reverse().join('/')}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-500">{brl(d.entradas_realizadas)}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{brl(d.saidas_realizadas)}</TableCell>
                    {includeProjected && <TableCell className="text-right tabular-nums text-muted-foreground">{brl(d.entradas_previstas)}</TableCell>}
                    {includeProjected && <TableCell className="text-right tabular-nums text-muted-foreground">{brl(d.saidas_previstas)}</TableCell>}
                    <TableCell className={`text-right tabular-nums font-medium ${d.saldo_dia < 0 ? 'text-destructive' : ''}`}>{brl(d.saldo_dia)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${d.saldo_acumulado < 0 ? 'text-destructive' : ''}`}>{brl(d.saldo_acumulado)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: 'default' | 'success' | 'destructive' }) {
  const toneClass =
    tone === 'success'     ? 'text-emerald-500' :
    tone === 'destructive' ? 'text-destructive' :
                             'text-foreground';
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{brl(value)}</div>
      </CardContent>
    </Card>
  );
}