import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCombos, type Combo } from '@/hooks/useCombos';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, PackagePlus, X, AlertTriangle, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadCompressedImage } from '@/utils/imageUtils';
import { Navigate } from 'react-router-dom';

interface DraftItem {
  product_id: string;
  quantity: number;
}

const EMPTY_DRAFT = {
  id: undefined as string | undefined,
  name: '',
  code: '',
  gtin: '',
  description: '',
  image_url: '',
  price: 0,
  active: true,
  pdv_item: true,
  menu_item: true,
  waiter_item: true,
  fiscal_mode: 'explodido' as 'explodido' | 'kit_comercial',
  ncm: '',
  cfop: '',
  cest: '',
  tax_rule_id: '' as string | '',
  items: [] as DraftItem[],
  category_ids: [] as string[],
};

export default function Combos() {
  const { company } = useAuthContext();
  const { isModuleEnabled, loading: modLoading } = useCompanyModules({ companyId: company?.id });
  const { combos, loading, saveCombo, deleteCombo, toggleActive } = useCombos({ companyId: company?.id });
  const { products } = useProducts({ companyId: company?.id });
  const { categories } = useCategories({ companyId: company?.id });
  const { taxRules } = useTaxRules({ companyId: company?.id });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [productSearch, setProductSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  if (!modLoading && !isModuleEnabled('combos_v1')) {
    return <Navigate to="/" replace />;
  }

  function openNew() {
    setDraft(EMPTY_DRAFT);
    setOpen(true);
  }

  function openEdit(c: Combo) {
    setDraft({
      id: c.id,
      name: c.name,
      code: c.code || '',
      gtin: c.gtin || '',
      description: c.description || '',
      image_url: c.image_url || '',
      price: c.price,
      active: c.active,
      pdv_item: c.pdv_item,
      menu_item: c.menu_item,
      waiter_item: c.waiter_item,
      fiscal_mode: c.fiscal_mode,
      ncm: c.ncm || '',
      cfop: c.cfop || '',
      cest: c.cest || '',
      tax_rule_id: c.tax_rule_id || '',
      items: c.items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
      category_ids: c.category_ids,
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      toast.error('Informe o nome do combo');
      return;
    }
    if (draft.items.length === 0) {
      toast.error('Adicione pelo menos 1 item ao combo');
      return;
    }
    const ok = await saveCombo(
      {
        id: draft.id,
        name: draft.name.trim(),
        code: draft.code.trim() || null,
        gtin: draft.gtin.trim() || null,
        description: draft.description.trim() || null,
        image_url: draft.image_url || null,
        price: Number(draft.price) || 0,
        active: draft.active,
        pdv_item: draft.pdv_item,
        menu_item: draft.menu_item,
        waiter_item: draft.waiter_item,
        fiscal_mode: draft.fiscal_mode,
        ncm: draft.ncm.trim() || null,
        cfop: draft.cfop.trim() || null,
        cest: draft.cest.trim() || null,
        tax_rule_id: draft.tax_rule_id || null,
      },
      draft.items,
      draft.category_ids
    );
    if (ok) setOpen(false);
  }

  async function handleUpload(file: File) {
    if (!company?.id) return;
    setUploading(true);
    try {
      const path = `combos/${company.id}/${Date.now()}.webp`;
      const result = await uploadCompressedImage(supabase, 'product-images', path, file, { upsert: true });
      if (result) setDraft((d) => ({ ...d, image_url: result.publicUrl }));
    } catch (e) {
      toast.error('Erro ao enviar imagem');
    } finally {
      setUploading(false);
    }
  }

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products
      .filter((p) => p.active)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [products, productSearch]);

  // Aviso: itens com tributação divergente
  const fiscalWarning = useMemo(() => {
    if (draft.items.length < 2) return null;
    const rules = new Set(
      draft.items
        .map((it) => products.find((p) => p.id === it.product_id)?.taxRuleId || '—')
        .filter(Boolean)
    );
    if (rules.size > 1) return 'Os itens deste combo têm regras tributárias diferentes. Na NFC-e, cada item sai com sua própria tributação (modo explodido).';
    return null;
  }, [draft.items, products]);

  function addItem(productId: string) {
    if (draft.items.some((it) => it.product_id === productId)) return;
    setDraft((d) => ({ ...d, items: [...d.items, { product_id: productId, quantity: 1 }] }));
  }

  function updateItemQty(productId: string, qty: number) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => (it.product_id === productId ? { ...it, quantity: qty } : it)),
    }));
  }

  function removeItem(productId: string) {
    setDraft((d) => ({ ...d, items: d.items.filter((it) => it.product_id !== productId) }));
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PackagePlus className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Combos</h1>
              <p className="text-sm text-muted-foreground">
                Monte combos com produtos cadastrados. Na NFC-e, sai como kit explodido (cada item com sua tributação).
              </p>
            </div>
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Novo Combo
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Combos cadastrados ({combos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Carregando...</div>
            ) : combos.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                Nenhum combo cadastrado. Clique em "Novo Combo" para começar.
              </div>
            ) : (
              <div className="space-y-2">
                {combos.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {c.image_url ? (
                          <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {c.name}
                          {!c.active && <Badge variant="secondary">Inativo</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.items.length} item(ns) · R$ {c.price.toFixed(2).replace('.', ',')}
                          {c.code ? ` · ${c.code}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={c.active} onCheckedChange={(v) => toggleActive(c.id, v)} />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(`Excluir o combo "${c.name}"?`)) deleteCombo(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Editar Combo' : 'Novo Combo'}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="geral" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="itens">Itens ({draft.items.length})</TabsTrigger>
              <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
            </TabsList>

            {/* GERAL */}
            <TabsContent value="geral" className="space-y-4 mt-4">
              <div className="flex gap-4">
                <div className="w-28 h-28 rounded border bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                  {draft.image_url ? (
                    <img src={draft.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Label>Foto do combo</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                    }}
                  />
                  {draft.image_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDraft((d) => ({ ...d, image_url: '' }))}
                    >
                      Remover imagem
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome *</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <Label>Código interno</Label>
                  <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="ex.: COMBO001" />
                </div>
                <div>
                  <Label>GTIN/EAN</Label>
                  <Input value={draft.gtin} onChange={(e) => setDraft({ ...draft, gtin: e.target.value })} />
                </div>
                <div>
                  <Label>Preço do combo (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
                  <Label>Ativo</Label>
                </div>
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div>
                <Label className="mb-2 block">Categorias no cardápio</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border rounded p-2">
                  {categories.length === 0 && (
                    <span className="text-xs text-muted-foreground">Nenhuma categoria cadastrada.</span>
                  )}
                  {categories.map((cat) => {
                    const checked = draft.category_ids.includes(cat.id);
                    return (
                      <label
                        key={cat.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded border cursor-pointer text-sm ${
                          checked ? 'bg-primary/10 border-primary' : ''
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setDraft((d) => ({
                              ...d,
                              category_ids: v
                                ? [...d.category_ids, cat.id]
                                : d.category_ids.filter((x) => x !== cat.id),
                            }))
                          }
                        />
                        {cat.name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Visibilidade</Label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={draft.pdv_item} onCheckedChange={(v) => setDraft({ ...draft, pdv_item: v })} />
                    PDV
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={draft.menu_item} onCheckedChange={(v) => setDraft({ ...draft, menu_item: v })} />
                    Cardápio
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={draft.waiter_item} onCheckedChange={(v) => setDraft({ ...draft, waiter_item: v })} />
                    Garçom
                  </label>
                </div>
              </div>
            </TabsContent>

            {/* ITENS */}
            <TabsContent value="itens" className="space-y-3 mt-4">
              <div>
                <Label>Buscar produto para adicionar</Label>
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Nome ou código"
                />
                {productSearch && (
                  <div className="mt-2 max-h-48 overflow-y-auto border rounded">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between"
                        onClick={() => {
                          addItem(p.id);
                          setProductSearch('');
                        }}
                      >
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          R$ {p.price.toFixed(2).replace('.', ',')}
                        </span>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum produto encontrado</div>
                    )}
                  </div>
                )}
              </div>

              {fiscalWarning && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  {fiscalWarning}
                </div>
              )}

              <div className="space-y-2">
                {draft.items.length === 0 && (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    Nenhum item ainda. Use a busca acima para adicionar.
                  </div>
                )}
                {draft.items.map((it) => {
                  const p = products.find((x) => x.id === it.product_id);
                  return (
                    <div key={it.product_id} className="flex items-center gap-3 p-2 border rounded">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p?.name || it.product_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {p?.code ? `${p.code} · ` : ''}R$ {(p?.price ?? 0).toFixed(2).replace('.', ',')}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={it.quantity}
                        onChange={(e) => updateItemQty(it.product_id, Number(e.target.value))}
                        className="w-20"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => removeItem(it.product_id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* FISCAL */}
            <TabsContent value="fiscal" className="space-y-4 mt-4">
              <div className="p-3 bg-muted/50 border rounded text-sm">
                <strong>Modo padrão: Kit explodido.</strong> Na NFC-e, cada item componente sai como uma linha
                fiscal própria com sua tributação. O preço do combo é rateado proporcionalmente entre os itens.
                Os campos abaixo só são usados se o combo for emitido como "kit comercial" (item único na nota).
              </div>

              <div>
                <Label>Modo fiscal</Label>
                <Select
                  value={draft.fiscal_mode}
                  onValueChange={(v: any) => setDraft({ ...draft, fiscal_mode: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="explodido">Explodido (padrão) — recomendado</SelectItem>
                    <SelectItem value="kit_comercial">Kit comercial (1 item fiscal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>NCM</Label>
                  <Input value={draft.ncm} onChange={(e) => setDraft({ ...draft, ncm: e.target.value })} placeholder="00000000" />
                </div>
                <div>
                  <Label>CFOP</Label>
                  <Input value={draft.cfop} onChange={(e) => setDraft({ ...draft, cfop: e.target.value })} placeholder="5102" />
                </div>
                <div>
                  <Label>CEST</Label>
                  <Input value={draft.cest} onChange={(e) => setDraft({ ...draft, cest: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Regra tributária</Label>
                <Select
                  value={draft.tax_rule_id || 'none'}
                  onValueChange={(v) => setDraft({ ...draft, tax_rule_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="(opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nenhuma —</SelectItem>
                    {taxRules.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>{draft.id ? 'Salvar' : 'Criar combo'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}