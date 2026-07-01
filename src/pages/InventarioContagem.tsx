import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ClipboardList, Loader2, Plus, PlayCircle, CheckCircle2, XCircle, AlertTriangle,
  Search, ArrowLeft, ScanBarcode, ChevronRight,
} from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { useAuthContext } from '@/contexts/AuthContext';
import { useMercadoEnabled } from '@/hooks/useMercadoEnabled';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';

interface InventoryCount {
  id: string;
  company_id: string;
  reference_date: string;
  status: 'open' | 'counting' | 'review' | 'closed' | 'canceled';
  scope: 'all' | 'category' | 'custom';
  notes: string | null;
  total_items: number;
  divergent_items: number;
  adjustment_value: number;
  closed_at: string | null;
  created_at: string;
}

interface InventoryCountItem {
  id: string;
  count_id: string;
  product_id: string;
  expected_qty: number;
  counted_qty: number | null;
  recount_qty: number | null;
  final_qty: number | null;
  unit_cost: number;
  variance: number | null;
  approved: boolean;
}

type Mode = 'list' | 'counting' | 'review';

function fmtQty(v: number | null | undefined) {
  if (v == null) return '-';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
function fmtMoney(v: number | null | undefined) {
  if (v == null) return 'R$ 0,00';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function InventarioContagem() {
  const { company, user } = useAuthContext();
  const navigate = useNavigate();
  const { enabled: mercadoEnabled, loading: mercadoLoading } = useMercadoEnabled(company?.id);
  const { products } = useProducts({ companyId: company?.id });

  const [mode, setMode] = useState<Mode>('list');
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCount, setActiveCount] = useState<InventoryCount | null>(null);
  const [items, setItems] = useState<InventoryCountItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // dialogs
  const [openNew, setOpenNew] = useState(false);
  const [newScope, setNewScope] = useState<'all' | 'category' | 'custom'>('all');
  const [newCategory, setNewCategory] = useState<string>('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  // counting UI
  const [scanQuery, setScanQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState('');

  const categories = useMemo(
    () => Array.from(new Set(products.filter((p) => (p as any).trackStock).map((p) => p.category).filter(Boolean))).sort(),
    [products],
  );

  const productById = useMemo(() => {
    const m = new Map<string, typeof products[number]>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  // --- load list ---
  async function loadCounts() {
    if (!company?.id) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('inventory_counts')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast.error('Erro ao carregar contagens');
      return;
    }
    setCounts((data || []) as InventoryCount[]);
  }

  useEffect(() => { loadCounts(); }, [company?.id]);

  async function loadItems(countId: string) {
    setItemsLoading(true);
    const { data, error } = await (supabase as any)
      .from('inventory_count_items')
      .select('*')
      .eq('count_id', countId)
      .order('created_at', { ascending: true });
    setItemsLoading(false);
    if (error) {
      toast.error('Erro ao carregar itens');
      return;
    }
    setItems((data || []) as InventoryCountItem[]);
  }

  // --- open new count ---
  async function handleCreate() {
    if (!company?.id) return;
    if (newScope === 'category' && !newCategory) {
      toast.error('Escolha uma categoria');
      return;
    }
    setCreating(true);
    const { data, error } = await (supabase as any).rpc('open_inventory_count', {
      _company_id: company.id,
      _scope: newScope,
      _product_ids: null,
      _category: newScope === 'category' ? newCategory : null,
      _notes: newNotes.trim() || null,
    });
    setCreating(false);
    if (error) {
      toast.error('Falha ao abrir contagem: ' + error.message);
      return;
    }
    toast.success('Contagem aberta');
    setOpenNew(false);
    setNewNotes(''); setNewCategory(''); setNewScope('all');
    await loadCounts();
    // abre em modo contagem
    const newId = data as string;
    const { data: countRow } = await (supabase as any)
      .from('inventory_counts').select('*').eq('id', newId).maybeSingle();
    if (countRow) enterCounting(countRow as InventoryCount);
  }

  async function enterCounting(c: InventoryCount) {
    setActiveCount(c);
    setMode('counting');
    setScanQuery(''); setSelectedProductId(null); setQtyInput('');
    await loadItems(c.id);
  }

  async function enterReview(c: InventoryCount) {
    setActiveCount(c);
    setMode('review');
    await loadItems(c.id);
  }

  function backToList() {
    setMode('list');
    setActiveCount(null);
    setItems([]);
    loadCounts();
  }

  // --- counting: find item by scan (GTIN, code, name) ---
  function findItemByQuery(q: string): InventoryCountItem | null {
    const norm = q.trim().toLowerCase();
    if (!norm) return null;
    for (const it of items) {
      const p = productById.get(it.product_id);
      if (!p) continue;
      if ((p as any).gtin && String((p as any).gtin) === q.trim()) return it;
      if ((p as any).code && String((p as any).code).toLowerCase() === norm) return it;
      if (p.name.toLowerCase().includes(norm)) return it;
    }
    return null;
  }

  function handleScan() {
    const it = findItemByQuery(scanQuery);
    if (!it) {
      toast.error('Produto não está nesta contagem');
      return;
    }
    setSelectedProductId(it.product_id);
    setQtyInput('');
    // foco no qty via setTimeout
    setTimeout(() => {
      const el = document.getElementById('inv-qty-input') as HTMLInputElement | null;
      el?.focus();
    }, 50);
  }

  const selectedItem = selectedProductId ? items.find((i) => i.product_id === selectedProductId) : null;
  const selectedProduct = selectedItem ? productById.get(selectedItem.product_id) : null;

  async function saveCount() {
    if (!selectedItem) return;
    const parsed = Number(qtyInput.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Quantidade inválida');
      return;
    }
    const finalQty = parsed;
    const variance = finalQty - Number(selectedItem.expected_qty);
    const { error } = await (supabase as any)
      .from('inventory_count_items')
      .update({
        counted_qty: finalQty,
        final_qty: finalQty,
        variance,
        counted_at: new Date().toISOString(),
        counted_by: user?.id ?? null,
        approved: false,
      })
      .eq('id', selectedItem.id);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success(`${selectedProduct?.name} contado`);
    setScanQuery(''); setSelectedProductId(null); setQtyInput('');
    await loadItems(activeCount!.id);
    setTimeout(() => {
      const el = document.getElementById('inv-scan-input') as HTMLInputElement | null;
      el?.focus();
    }, 50);
  }

  // --- review ---
  const countedItems = items.filter((i) => i.counted_qty != null);
  const uncountedItems = items.filter((i) => i.counted_qty == null);
  const divergent = countedItems.filter((i) => Math.abs(Number(i.variance ?? 0)) > 0.0001);

  async function toggleApprove(item: InventoryCountItem, approved: boolean) {
    const { error } = await (supabase as any)
      .from('inventory_count_items').update({ approved }).eq('id', item.id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, approved } : i));
  }

  async function approveAll(value: boolean) {
    if (!activeCount) return;
    const { error } = await (supabase as any)
      .from('inventory_count_items').update({ approved: value })
      .eq('count_id', activeCount.id).not('counted_qty', 'is', null);
    if (error) { toast.error(error.message); return; }
    await loadItems(activeCount.id);
  }

  async function handleClose() {
    if (!activeCount) return;
    setClosing(true);
    const { data, error } = await (supabase as any).rpc('close_inventory_count', {
      _count_id: activeCount.id,
    });
    setClosing(false);
    setConfirmClose(false);
    if (error) {
      toast.error('Erro ao fechar: ' + error.message);
      return;
    }
    const r = data as { divergent_items: number; adjustment_value: number };
    toast.success(`Contagem encerrada · ${r.divergent_items} ajuste(s) · ${fmtMoney(r.adjustment_value)}`);
    backToList();
  }

  if (mercadoLoading) {
    return <AppLayout><div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div></AppLayout>;
  }
  if (!mercadoEnabled) {
    return <Navigate to="/" replace />;
  }

  // -------- RENDER: LISTA --------
  if (mode === 'list') {
    return (
      <AppLayout>
        <div className="container py-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <ClipboardList className="w-6 h-6" /> Inventário — Contagem Cega
              </h1>
              <p className="text-sm text-muted-foreground">
                Registre a contagem física do estoque. Ao fechar, ajustes são gerados automaticamente.
              </p>
            </div>
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nova contagem
            </Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Contagens</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
              ) : counts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma contagem realizada. Clique em <b>Nova contagem</b> para começar.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Escopo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Itens</TableHead>
                      <TableHead className="text-right">Divergências</TableHead>
                      <TableHead className="text-right">Ajuste (R$)</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {counts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(c.created_at).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          {c.scope === 'all' ? 'Todos os produtos' : c.scope === 'category' ? 'Por categoria' : 'Personalizado'}
                        </TableCell>
                        <TableCell>
                          {c.status === 'closed' && <Badge variant="secondary">Encerrada</Badge>}
                          {c.status === 'counting' && <Badge className="bg-blue-600 hover:bg-blue-600">Em contagem</Badge>}
                          {c.status === 'review' && <Badge className="bg-amber-500 hover:bg-amber-500">Revisão</Badge>}
                          {c.status === 'canceled' && <Badge variant="destructive">Cancelada</Badge>}
                          {c.status === 'open' && <Badge variant="outline">Aberta</Badge>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.total_items}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.divergent_items}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(c.adjustment_value)}</TableCell>
                        <TableCell className="text-right">
                          {c.status === 'counting' || c.status === 'review' ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={() => enterCounting(c)}>
                                <PlayCircle className="w-4 h-4 mr-1" /> Contar
                              </Button>
                              <Button size="sm" onClick={() => enterReview(c)}>
                                Revisar <ChevronRight className="w-4 h-4 ml-1" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => enterReview(c)}>
                              Ver detalhes
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Dialog: Nova contagem */}
        <Dialog open={openNew} onOpenChange={(o) => !creating && setOpenNew(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova contagem de estoque</DialogTitle>
              <DialogDescription>
                Um snapshot do saldo teórico será congelado. Durante a contagem, o operador NÃO verá o esperado (contagem cega).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Escopo</Label>
                <Select value={newScope} onValueChange={(v) => setNewScope(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os produtos com controle de estoque</SelectItem>
                    <SelectItem value="category">Por categoria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newScope === 'category' && (
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger><SelectValue placeholder="Escolha..." /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2}
                  placeholder="Ex: contagem anual 31/12" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenNew(false)} disabled={creating}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Abrir contagem
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppLayout>
    );
  }

  // -------- RENDER: CONTAGEM (cega) --------
  if (mode === 'counting' && activeCount) {
    const progress = items.length > 0 ? Math.round((countedItems.length / items.length) * 100) : 0;
    return (
      <AppLayout>
        <div className="container py-6 space-y-4 max-w-3xl">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={backToList}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="text-sm text-muted-foreground">
              Progresso: <b>{countedItems.length}</b>/{items.length} ({progress}%)
            </div>
            <Button onClick={() => setMode('review')} disabled={countedItems.length === 0}>
              Ir para revisão <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <Card className="border-blue-500/40 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ScanBarcode className="w-5 h-5" /> Escaneie ou busque o produto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  id="inv-scan-input"
                  autoFocus
                  placeholder="Código de barras, código interno ou nome do produto"
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } }}
                  className="h-12 text-base"
                />
                <Button size="lg" onClick={handleScan}><Search className="w-4 h-4" /></Button>
              </div>

              {selectedItem && selectedProduct && (
                <div className="rounded-md border bg-background p-4 space-y-3">
                  <div>
                    <div className="font-semibold text-lg">{selectedProduct.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(selectedProduct as any).unit || 'UN'}
                      {(selectedProduct as any).gtin ? ` · GTIN ${(selectedProduct as any).gtin}` : ''}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-qty-input">Quantidade contada</Label>
                    <Input
                      id="inv-qty-input"
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={qtyInput}
                      onChange={(e) => setQtyInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveCount(); } }}
                      className="h-14 text-2xl tabular-nums"
                      placeholder="0"
                    />
                    {selectedItem.counted_qty != null && (
                      <div className="text-xs text-amber-600">
                        Já contado: {fmtQty(selectedItem.counted_qty)} — vai sobrescrever
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" onClick={() => { setSelectedProductId(null); setQtyInput(''); setScanQuery(''); }}>
                      Cancelar
                    </Button>
                    <Button onClick={saveCount}>Salvar (Enter)</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Últimos contados</CardTitle>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="animate-spin" /></div>
              ) : countedItems.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">Nenhum item contado ainda</div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-auto">
                  {countedItems.slice(-15).reverse().map((it) => {
                    const p = productById.get(it.product_id);
                    return (
                      <div key={it.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                        <span className="truncate">{p?.name || it.product_id}</span>
                        <span className="tabular-nums font-medium">{fmtQty(it.counted_qty)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // -------- RENDER: REVISÃO --------
  if (mode === 'review' && activeCount) {
    const allApproved = countedItems.length > 0 && countedItems.every((i) => i.approved);
    const totalAjuste = countedItems
      .filter((i) => i.approved)
      .reduce((acc, i) => acc + Number(i.variance ?? 0) * Number(i.unit_cost ?? 0), 0);

    return (
      <AppLayout>
        <div className="container py-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={backToList}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="flex gap-2">
              {activeCount.status !== 'closed' && (
                <>
                  <Button variant="outline" onClick={() => setMode('counting')}>
                    <PlayCircle className="w-4 h-4 mr-1" /> Continuar contando
                  </Button>
                  <Button variant="outline" onClick={() => approveAll(true)}>
                    Aprovar todos
                  </Button>
                  <Button onClick={() => setConfirmClose(true)} disabled={countedItems.length === 0 || !allApproved}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Fechar contagem
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Itens no snapshot</div>
              <div className="text-2xl font-semibold tabular-nums">{items.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Contados</div>
              <div className="text-2xl font-semibold tabular-nums">{countedItems.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Divergentes</div>
              <div className="text-2xl font-semibold tabular-nums text-amber-600">{divergent.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Ajuste (R$) aprovado</div>
              <div className={`text-2xl font-semibold tabular-nums ${totalAjuste < 0 ? 'text-red-600' : totalAjuste > 0 ? 'text-emerald-600' : ''}`}>
                {fmtMoney(totalAjuste)}
              </div>
            </CardContent></Card>
          </div>

          {uncountedItems.length > 0 && activeCount.status !== 'closed' && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="pt-4 flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                {uncountedItems.length} produto(s) ainda não contados serão IGNORADOS ao fechar.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Itens contados</CardTitle></CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
              ) : countedItems.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">Nenhum item contado</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Contado</TableHead>
                      <TableHead className="text-right">Variação</TableHead>
                      <TableHead className="text-right">Custo un.</TableHead>
                      <TableHead className="text-right">Ajuste R$</TableHead>
                      <TableHead className="text-center">Aprovar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {countedItems.map((it) => {
                      const p = productById.get(it.product_id);
                      const varN = Number(it.variance ?? 0);
                      const ajuste = varN * Number(it.unit_cost ?? 0);
                      return (
                        <TableRow key={it.id}>
                          <TableCell className="font-medium">{p?.name || it.product_id}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtQty(it.expected_qty)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtQty(it.counted_qty)}</TableCell>
                          <TableCell className={`text-right tabular-nums ${varN < 0 ? 'text-red-600' : varN > 0 ? 'text-emerald-600' : ''}`}>
                            {varN > 0 ? '+' : ''}{fmtQty(varN)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(it.unit_cost)}</TableCell>
                          <TableCell className={`text-right tabular-nums ${ajuste < 0 ? 'text-red-600' : ajuste > 0 ? 'text-emerald-600' : ''}`}>
                            {fmtMoney(ajuste)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={it.approved}
                              disabled={activeCount.status === 'closed'}
                              onCheckedChange={(v) => toggleApprove(it, !!v)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fechar contagem?</AlertDialogTitle>
              <AlertDialogDescription>
                Serão gerados <b>{divergent.filter((i) => i.approved).length}</b> ajuste(s) de estoque, num total de <b>{fmtMoney(totalAjuste)}</b>.
                Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={closing}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleClose} disabled={closing}>
                {closing && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Confirmar e fechar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    );
  }

  return null;
}