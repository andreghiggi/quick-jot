import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Boxes, Loader2, Search, ArrowDownToLine, ArrowUpFromLine, Settings2, History, Download } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { useProducts } from '@/hooks/useProducts';
import { useStockMovements, StockMovementType } from '@/hooks/useStockMovements';

type AdjustMode = 'in' | 'out' | 'set';

const TYPE_LABELS: Record<StockMovementType, string> = {
  sale: 'Venda',
  manual_in: 'Entrada',
  manual_out: 'Saída',
  adjustment: 'Ajuste',
  initial: 'Saldo inicial',
};

export default function EstoqueRelatorio() {
  const { company } = useAuthContext();
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);
  const { products, loading: productsLoading, refetch, updateProduct } = useProducts({ companyId: company?.id });
  const { movements, loading: histLoading, refetch: refetchMovs, applyMovement } = useStockMovements({ companyId: company?.id });

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);

  // dialog de ajuste
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);
  const [adjustMode, setAdjustMode] = useState<AdjustMode>('in');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const tracked = useMemo(
    () => products.filter((p) => (p as any).trackStock),
    [products],
  );

  const categories = useMemo(
    () => Array.from(new Set(tracked.map((p) => p.category))).sort(),
    [tracked],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracked
      .filter((p) => (categoryFilter === 'all' ? true : p.category === categoryFilter))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) ||
            ((p as any).code || '').toLowerCase().includes(q) ||
            ((p as any).gtin || '').toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tracked, query, categoryFilter]);

  const adjustProduct = adjustProductId ? products.find((p) => p.id === adjustProductId) : null;
  const historyProduct = historyProductId ? products.find((p) => p.id === historyProductId) : null;
  const historyMovs = useMemo(
    () => (historyProductId ? movements.filter((m) => m.product_id === historyProductId) : []),
    [movements, historyProductId],
  );

  function openAdjust(productId: string, mode: AdjustMode) {
    setAdjustProductId(productId);
    setAdjustMode(mode);
    setAdjustQty('');
    setAdjustNotes('');
  }

  async function handleAdjustSubmit() {
    if (!adjustProduct) return;
    const qty = parseFloat(adjustQty.replace(',', '.'));
    if (!isFinite(qty) || qty < 0) {
      toast.error('Informe uma quantidade válida.');
      return;
    }
    setSubmitting(true);
    try {
      if (adjustMode === 'set') {
        // Ajuste de inventário: calcula delta para chegar no saldo informado
        const current = Number((adjustProduct as any).stockQuantity ?? 0);
        const delta = qty - current;
        const newBal = await applyMovement({
          productId: adjustProduct.id,
          quantity: delta,
          type: 'adjustment',
          referenceType: 'manual',
          notes: adjustNotes || `Ajuste de inventário (${current} → ${qty})`,
        });
        if (newBal === null) {
          toast.error('Não foi possível ajustar — produto sem controle de estoque?');
        } else {
          toast.success(`Saldo ajustado para ${qty}`);
        }
      } else {
        const delta = adjustMode === 'in' ? qty : -qty;
        const newBal = await applyMovement({
          productId: adjustProduct.id,
          quantity: delta,
          type: adjustMode === 'in' ? 'manual_in' : 'manual_out',
          referenceType: 'manual',
          notes: adjustNotes || null,
        });
        if (newBal === null) {
          toast.error('Produto sem controle de estoque ativo.');
        } else {
          toast.success(
            adjustMode === 'in' ? `Entrada de ${qty} registrada` : `Saída de ${qty} registrada`,
          );
        }
      }
      await Promise.all([refetch(), refetchMovs()]);
      setAdjustProductId(null);
    } finally {
      setSubmitting(false);
    }
  }

  function exportCSV() {
    const header = ['Produto', 'Código', 'GTIN', 'Categoria', 'Saldo', 'Mínimo', 'Status'];
    const rows = filtered.map((p) => {
      const saldo = Number((p as any).stockQuantity ?? 0);
      const min = Number((p as any).minStock ?? 0);
      const status = saldo <= 0 ? 'Sem estoque' : saldo <= min ? 'Abaixo do mínimo' : 'OK';
      return [
        p.name,
        (p as any).code || '',
        (p as any).gtin || '',
        p.category,
        saldo,
        min,
        status,
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estoque-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (mercadoLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!mercadoEnabled) {
    return <Navigate to="/pdv-v2" replace />;
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-4 max-w-7xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Estoque</h1>
            <Badge variant="outline">Mercado</Badge>
          </div>
          <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Produtos com controle de estoque ativo</CardTitle>
            <p className="text-xs text-muted-foreground">
              Para rastrear um produto, edite-o em Produtos e ative <strong>Controle de estoque</strong>.
              A baixa acontece automaticamente em cada venda no Frente de Caixa.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, SKU ou GTIN…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-md overflow-hidden">
              {productsLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                  Carregando…
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum produto com controle de estoque.{' '}
                  Vá em <strong>Produtos</strong>, edite um item e ative o controle.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2 font-medium">Produto</th>
                      <th className="text-left p-2 font-medium hidden md:table-cell">Categoria</th>
                      <th className="text-right p-2 font-medium">Saldo</th>
                      <th className="text-right p-2 font-medium hidden sm:table-cell">Mínimo</th>
                      <th className="text-right p-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((p) => {
                      const saldo = Number((p as any).stockQuantity ?? 0);
                      const min = Number((p as any).minStock ?? 0);
                      const tone =
                        saldo <= 0 ? 'text-destructive' :
                        saldo <= min ? 'text-amber-600' : 'text-emerald-600';
                      return (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="p-2">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {(p as any).code || '—'}{' '}
                              {(p as any).gtin ? `· ${(p as any).gtin}` : ''}
                            </div>
                          </td>
                          <td className="p-2 hidden md:table-cell text-muted-foreground">{p.category}</td>
                          <td className={`p-2 text-right tabular-nums font-semibold ${tone}`}>
                            {saldo}
                          </td>
                          <td className="p-2 text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                            {min}
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openAdjust(p.id, 'in')} title="Entrada">
                                <ArrowDownToLine className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openAdjust(p.id, 'out')} title="Saída">
                                <ArrowUpFromLine className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openAdjust(p.id, 'set')} title="Ajustar saldo">
                                <Settings2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setHistoryProductId(p.id)} title="Histórico">
                                <History className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de ajuste */}
      <Dialog open={!!adjustProductId} onOpenChange={(o) => { if (!o) setAdjustProductId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adjustMode === 'in' && 'Registrar entrada'}
              {adjustMode === 'out' && 'Registrar saída'}
              {adjustMode === 'set' && 'Ajustar saldo'}
            </DialogTitle>
          </DialogHeader>
          {adjustProduct && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-sm font-medium">{adjustProduct.name}</p>
                <p className="text-xs text-muted-foreground">
                  Saldo atual: <strong>{Number((adjustProduct as any).stockQuantity ?? 0)}</strong>
                </p>
              </div>
              <div>
                <Label>
                  {adjustMode === 'set' ? 'Novo saldo' : 'Quantidade'}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div>
                <Label>Motivo (opcional)</Label>
                <Input
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Ex.: nota fiscal nº 123 / perda / contagem"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustProductId(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleAdjustSubmit} disabled={submitting || !adjustQty}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={!!historyProductId} onOpenChange={(o) => { if (!o) setHistoryProductId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Histórico de movimentos
              {historyProduct && <span className="text-muted-foreground"> — {historyProduct.name}</span>}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {histLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                Carregando…
              </div>
            ) : historyMovs.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Sem movimentos registrados.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Quando</th>
                    <th className="text-left p-2 font-medium">Tipo</th>
                    <th className="text-right p-2 font-medium">Qtd</th>
                    <th className="text-right p-2 font-medium">Saldo</th>
                    <th className="text-left p-2 font-medium">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyMovs.map((m) => (
                    <tr key={m.id}>
                      <td className="p-2 text-xs text-muted-foreground tabular-nums">
                        {new Date(m.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline">{TYPE_LABELS[m.type]}</Badge>
                      </td>
                      <td className={`p-2 text-right tabular-nums font-medium ${m.quantity < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </td>
                      <td className="p-2 text-right tabular-nums">{m.balance_after}</td>
                      <td className="p-2 text-xs text-muted-foreground">{m.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}