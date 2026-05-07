import { useMemo, useState } from 'react';
import { Plus, Search, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useOptionalGroups, OptionalGroup } from '@/hooks/useOptionalGroups';
import { Product, ProductOptional } from '@/types/product';
import { brl as formatPrice, LANCHERIA_I9_COMPANY_ID } from './_format';
import { PDVV2CategoryBrowser } from './PDVV2CategoryBrowser';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ExtraItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes?: string;
}

interface Props {
  companyId?: string;
  items: ExtraItem[];
  onChange: (items: ExtraItem[]) => void;
}

export function PDVV2AddItemSearch({ companyId, items, onChange }: Props) {
  const { products, loading } = useProducts({ companyId });
  const { categories } = useCategories({ companyId });
  const { groups: optionalGroups } = useOptionalGroups({ companyId });
  const isLancheriaI9 = true;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOptionals, setSelectedOptionals] = useState<ProductOptional[]>([]);
  const [selectedGroupItems, setSelectedGroupItems] = useState<Record<string, Map<string, number>>>({});

  const categoryIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => { map[c.name] = c.id; });
    return map;
  }, [categories]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.active && p.pdvItem !== false),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeProducts.slice(0, 8);
    return activeProducts
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [activeProducts, query]);

  function getGroupsFor(p: Product): OptionalGroup[] {
    const catId = categoryIdByName[p.category];
    return optionalGroups
      .filter((g) => {
        if (!g.active) return false;
        if (g.productIds.includes(p.id)) return true;
        if (catId && g.categoryIds.includes(catId)) return true;
        return false;
      })
      .map((g) => {
        const ov = g.productOverrides?.find((o) => o.productId === p.id);
        if (ov && (ov.minSelectOverride !== null || ov.maxSelectOverride !== null)) {
          return {
            ...g,
            minSelect: ov.minSelectOverride ?? g.minSelect,
            maxSelect: ov.maxSelectOverride ?? g.maxSelect,
          };
        }
        return g;
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  const productGroups = selectedProduct ? getGroupsFor(selectedProduct) : [];
  const productOldOptionals = selectedProduct?.optionals?.filter((o) => o.active) || [];
  const hasOptionals = productGroups.length > 0 || productOldOptionals.length > 0;

  function pickProduct(p: Product) {
    const groups = getGroupsFor(p);
    const oldOpt = p.optionals?.filter((o) => o.active) || [];
    if (groups.length === 0 && oldOpt.length === 0) {
      // No optionals — add directly
      addItem(p, [], []);
      return;
    }
    setSelectedProduct(p);
    setSelectedOptionals([]);
    setSelectedGroupItems({} as Record<string, Map<string, number>>);
  }

  function toggleOptional(opt: ProductOptional) {
    setSelectedOptionals((prev) =>
      prev.find((o) => o.id === opt.id)
        ? prev.filter((o) => o.id !== opt.id)
        : [...prev, opt]
    );
  }

  function getGroupTotalSelected(groupId: string): number {
    const m = selectedGroupItems[groupId];
    if (!m) return 0;
    let total = 0;
    m.forEach((qty) => { total += qty; });
    return total;
  }

  function toggleGroupItem(groupId: string, itemId: string, maxSelect: number, maxPerItem: number = 1) {
    const maxGroup = maxSelect > 0 ? maxSelect : Infinity;
    setSelectedGroupItems((prev) => {
      const cur = new Map(prev[groupId] || []);
      const currentQty = cur.get(itemId) || 0;
      if (currentQty > 0) {
        cur.delete(itemId);
      } else {
        let totalSel = 0;
        (prev[groupId] || new Map()).forEach((q) => { totalSel += q; });
        if (totalSel >= maxGroup) {
          if (maxGroup === 1) { cur.clear(); cur.set(itemId, 1); }
          else { toast.error(`Máximo ${maxGroup} no grupo`); return prev; }
        } else {
          cur.set(itemId, 1);
        }
      }
      return { ...prev, [groupId]: cur };
    });
  }

  function changeGroupItemQty(groupId: string, itemId: string, delta: number, maxSelect: number, maxPerItem: number) {
    const maxGroup = maxSelect > 0 ? maxSelect : Infinity;
    setSelectedGroupItems((prev) => {
      const cur = new Map(prev[groupId] || []);
      const currentQty = cur.get(itemId) || 0;
      const newQty = currentQty + delta;
      if (newQty <= 0) {
        cur.delete(itemId);
      } else if (newQty > maxPerItem) {
        toast.error(`Máximo ${maxPerItem} por item`);
        return prev;
      } else {
        // Check group total
        let prevTotal = 0;
        (prev[groupId] || new Map()).forEach((q) => { prevTotal += q; });
        const totalSel = prevTotal - currentQty + newQty;
        if (totalSel > maxGroup) {
          toast.error(`Máximo ${maxGroup} no grupo`);
          return prev;
        }
        cur.set(itemId, newQty);
      }
      return { ...prev, [groupId]: cur };
    });
  }

  function confirmWithOptionals() {
    if (!selectedProduct) return;
    // Validate min selections
    for (const g of productGroups) {
      const sel = selectedGroupItems[g.id];
      const count = sel ? getGroupTotalSelected(g.id) : 0;
      if (g.minSelect > 0 && count < g.minSelect) {
        toast.error(`Selecione pelo menos ${g.minSelect} em "${g.name}"`);
        return;
      }
    }
    // Build optionals list
    const groupOpts: { name: string; price: number }[] = [];
    const groupedNames: string[] = [];
    for (const g of productGroups) {
      const sel = selectedGroupItems[g.id];
      if (!sel) continue;
      const picked: { name: string; price: number }[] = [];
      for (const it of g.items) {
        const qty = sel.get(it.id) || 0;
        if (qty > 0) {
          for (let i = 0; i < qty; i++) {
            groupOpts.push({ name: it.name, price: it.price });
          }
          picked.push({ name: qty > 1 ? `${qty}x ${it.name}` : it.name, price: it.price * qty });
        }
      }
      if (picked.length > 0) {
        groupedNames.push(`${g.name}: ${picked.map((i) => (i.price > 0 ? `${i.name} R$${i.price.toFixed(2)}` : i.name)).join(', ')}`);
      }
    }
    if (selectedOptionals.length > 0) {
      groupedNames.push(`Adicionais: ${selectedOptionals.map((o) => (o.price > 0 ? `${o.name} R$${o.price.toFixed(2)}` : o.name)).join(', ')}`);
    }
    addItem(selectedProduct, selectedOptionals, groupOpts, groupedNames);
    setSelectedProduct(null);
    setSelectedOptionals([]);
    setSelectedGroupItems({} as Record<string, Map<string, number>>);
  }

  function addItem(
    p: Product,
    oldOpts: ProductOptional[],
    groupOpts: { name: string; price: number }[],
    groupedNames: string[] = [],
  ) {
    const optPrice = [...oldOpts, ...groupOpts].reduce((s, o) => s + o.price, 0);
    const namesStr = groupedNames.length > 0 ? ` (${groupedNames.join(' | ')})` : '';
    const newItem: ExtraItem = {
      id: crypto.randomUUID(),
      product_id: p.id,
      product_name: p.name + namesStr,
      quantity: 1,
      unit_price: p.price + optPrice,
    };
    onChange([...items, newItem]);
    toast.success(`${p.name} adicionado`);
    setQuery('');
  }

  function updateQty(id: string, delta: number) {
    onChange(
      items
        .map((it) => (it.id === id ? { ...it, quantity: Math.max(0, it.quantity + delta) } : it))
        .filter((it) => it.quantity > 0)
    );
  }

  function removeItem(id: string) {
    onChange(items.filter((it) => it.id !== id));
  }

  return (
    <div className="space-y-2">
      {!open && items.length === 0 && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Adicionar Item
        </Button>
      )}

      {(open || items.length > 0) && (
        <div className="rounded-md border p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Itens adicionais</Label>
            {!open ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar mais
              </Button>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setSelectedProduct(null); setQuery(''); }}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Lista de itens já adicionados */}
          {items.length > 0 && (
            <div className="space-y-1">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-2 text-sm bg-background rounded p-2 border">
                  <div className="flex-1 min-w-0">
                    <p className="break-words">
                      {it.quantity}× {it.product_name}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatPrice(it.unit_price * it.quantity)}
                    </p>
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(it.id, -1)}>−</Button>
                  <span className="w-5 text-center text-sm tabular-nums">{it.quantity}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(it.id, +1)}>+</Button>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(it.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {open && !selectedProduct && isLancheriaI9 && (
            // I9: navegador estilo cardápio público (categorias com foto → subcategorias → produtos)
            <PDVV2CategoryBrowser
              companyId={companyId}
              pdvOnly
              onProductSelect={pickProduct}
              maxHeightClassName="max-h-[55vh]"
            />
          )}

          {open && !selectedProduct && !isLancheriaI9 && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Buscar produto..."
                  className="pl-8"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {loading ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Nenhum produto encontrado</p>
                  ) : (
                    filtered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent text-sm"
                        onClick={() => pickProduct(p)}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="tabular-nums text-muted-foreground shrink-0">{formatPrice(p.price)}</span>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {open && selectedProduct && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{selectedProduct.name}</p>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedProduct(null)}>
                  Voltar
                </Button>
              </div>

              {productOldOptionals.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Adicionais</Label>
                  {productOldOptionals.map((opt) => {
                    const checked = !!selectedOptionals.find((o) => o.id === opt.id);
                    return (
                      <label key={opt.id} className={cn('flex items-center justify-between gap-2 p-2 rounded border cursor-pointer text-sm', checked && 'border-primary bg-primary/5')}>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={checked} onCheckedChange={() => toggleOptional(opt)} />
                          <span>{opt.name}</span>
                        </div>
                        {opt.price > 0 && <span className="text-xs text-muted-foreground">+{formatPrice(opt.price)}</span>}
                      </label>
                    );
                  })}
                </div>
              )}

              {productGroups.map((g) => (
                <div key={g.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs font-semibold">{g.name}</Label>
                    <Badge variant="outline" className="text-[10px]">
                      {g.minSelect > 0 ? `mín ${g.minSelect} / ` : ''}máx {g.maxSelect > 0 ? g.maxSelect : 1}
                    </Badge>
                    {g.minSelect > 0 && <Badge variant="destructive" className="text-[10px]">Obrigatório</Badge>}
                  </div>
                  {g.items.filter((i) => i.active).map((it) => {
                    const qty = selectedGroupItems[g.id]?.get(it.id) || 0;
                    const checked = qty > 0;
                    const useQtyControls = isLancheriaI9 && g.maxQuantityPerItem > 1;
                    return (
                      <div key={it.id} className={cn('flex items-center justify-between gap-2 p-2 rounded border text-sm', checked && 'border-primary bg-primary/5', !useQtyControls && 'cursor-pointer')} onClick={!useQtyControls ? () => toggleGroupItem(g.id, it.id, g.maxSelect, g.maxQuantityPerItem) : undefined}>
                        <div className="flex items-center gap-2">
                          {!useQtyControls && <Checkbox checked={checked} onCheckedChange={() => toggleGroupItem(g.id, it.id, g.maxSelect, g.maxQuantityPerItem)} />}
                          <span>{it.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {it.price > 0 && <span className="text-xs text-muted-foreground">+{formatPrice(it.price)}</span>}
                          {useQtyControls && (
                            <div className="flex items-center gap-1">
                              <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => changeGroupItemQty(g.id, it.id, -1, g.maxSelect, g.maxQuantityPerItem)}>−</Button>
                              <span className="w-5 text-center text-xs tabular-nums">{qty}</span>
                              <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => changeGroupItemQty(g.id, it.id, 1, g.maxSelect, g.maxQuantityPerItem)}>+</Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              <Button type="button" className="w-full" size="sm" onClick={confirmWithOptionals}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar à comanda
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
