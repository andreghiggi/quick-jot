import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProducts } from '@/hooks/useProducts';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useCategories } from '@/hooks/useCategories';
import { useOptionalGroups } from '@/hooks/useOptionalGroups';
import { Product, ProductOptional, CartItem } from '@/types/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { LateralOptionalsWizard } from '@/components/menu/LateralOptionalsWizard';
import { formatPrice, cn } from '@/lib/utils';

interface MesaInfo {
  number: number;
  status: string;
  hasOpenTab: boolean;
  tabNumber: number | null;
}

export default function MesaQR() {
  const { slug } = useParams<{ slug: string }>();

  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [moduleEnabled, setModuleEnabled] = useState(false);
  const [mesas, setMesas] = useState<MesaInfo[]>([]);

  const [tableInput, setTableInput] = useState('');
  const [selectedMesa, setSelectedMesa] = useState<MesaInfo | null>(null);

  const { products } = useProducts({ companyId: companyId || undefined });
  const { settings } = useStoreSettings({ companyId: companyId || undefined });
  const { categories: allCategories } = useCategories({ companyId: companyId || undefined });
  const { groups: optionalGroups } = useOptionalGroups({ companyId: companyId || undefined });

  const categories = useMemo(() => allCategories.filter(c => c.active), [allCategories]);
  const categoryIdByName = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach(c => { m[c.name] = c.id; });
    return m;
  }, [categories]);

  const waiterProducts = useMemo(
    () => products.filter(p => p.active && p.waiterItem !== false),
    [products],
  );

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOptionals, setSelectedOptionals] = useState<ProductOptional[]>([]);
  const [selectedGroupItems, setSelectedGroupItems] = useState<Record<string, Map<string, number>>>({});
  const [itemNotes, setItemNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ tabNumber: number; tableNumber: number } | null>(null);

  const refreshBoot = useCallback(async () => {
    if (!slug) return;
    setBootLoading(true);
    setBootError(null);
    try {
      const { data, error } = await supabase.functions.invoke('mesa-public', {
        body: { action: 'bootstrap', slug },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCompanyId(data.companyId);
      setCompanyName(data.companyName);
      setModuleEnabled(!!data.moduleEnabled);
      setMesas(data.mesas || []);
    } catch (e: any) {
      setBootError(e?.message || 'erro');
    } finally {
      setBootLoading(false);
    }
  }, [slug]);

  useEffect(() => { refreshBoot(); }, [refreshBoot]);

  const selectedProductGroups = useMemo(() => {
    if (!selectedProduct) return [];
    const catId = categoryIdByName[selectedProduct.category];
    return optionalGroups
      .filter(g => {
        if (!g.active) return false;
        if (g.waiterOnly) return false;
        if (g.productIds.includes(selectedProduct.id)) return true;
        if (catId && g.categoryIds.includes(catId)) return true;
        return false;
      })
      .map(g => {
        const ov = g.productOverrides?.find(o => o.productId === selectedProduct.id);
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
  }, [selectedProduct, optionalGroups, categoryIdByName]);

  function toggleOptional(o: ProductOptional) {
    setSelectedOptionals(prev =>
      prev.some(x => x.id === o.id) ? prev.filter(x => x.id !== o.id) : [...prev, o],
    );
  }

  function toggleGroupItem(groupId: string, itemId: string, maxSelect: number) {
    setSelectedGroupItems(prev => {
      const cur = new Map(prev[groupId] || []);
      if (cur.has(itemId)) {
        cur.delete(itemId);
      } else {
        if (maxSelect > 0) {
          let total = 0;
          cur.forEach(q => { total += q; });
          if (total >= maxSelect) {
            const firstKey = cur.keys().next().value;
            if (firstKey) cur.delete(firstKey);
          }
        }
        cur.set(itemId, 1);
      }
      return { ...prev, [groupId]: cur };
    });
  }

  function changeGroupItemQty(groupId: string, itemId: string, delta: number, maxSelect: number, maxPerItem: number) {
    setSelectedGroupItems(prev => {
      const cur = new Map(prev[groupId] || []);
      const currentQty = cur.get(itemId) || 0;
      let newQty = currentQty + delta;
      if (newQty < 0) newQty = 0;
      if (maxPerItem > 0 && newQty > maxPerItem) newQty = maxPerItem;
      let total = 0;
      cur.forEach((q, k) => { if (k !== itemId) total += q; });
      if (maxSelect > 0 && total + newQty > maxSelect) newQty = maxSelect - total;
      if (newQty <= 0) cur.delete(itemId);
      else cur.set(itemId, newQty);
      return { ...prev, [groupId]: cur };
    });
  }

  function addToCart() {
    if (!selectedProduct) return;
    // valida mínimos
    for (const g of selectedProductGroups) {
      if (g.minSelect > 0) {
        const sel = selectedGroupItems[g.id];
        let count = 0;
        if (sel) sel.forEach(q => { count += q; });
        if (count < g.minSelect) {
          toast.error(`Selecione ao menos ${g.minSelect} em "${g.name}"`);
          return;
        }
      }
    }
    const groupedNames: string[] = [];
    let extraPrice = 0;
    for (const g of selectedProductGroups) {
      const sel = selectedGroupItems[g.id];
      if (!sel || sel.size === 0) continue;
      const parts: string[] = [];
      sel.forEach((qty, itemId) => {
        const item = g.items.find(i => i.id === itemId);
        if (!item) return;
        extraPrice += item.price * qty;
        parts.push(`${qty}x ${item.name}${item.price > 0 ? ` R$ ${formatPrice(item.price)}` : ''}`);
      });
      groupedNames.push(`${g.name}: ${parts.join(', ')}`);
    }
    const item: CartItem = {
      product: selectedProduct,
      quantity: 1,
      selectedOptionals: [...selectedOptionals],
      groupedOptionalNames: groupedNames.length > 0 ? groupedNames : undefined,
      notes: itemNotes || undefined,
    };
    setCart(prev => [...prev, item]);
    toast.success(`${selectedProduct.name} adicionado!`);
    setSelectedProduct(null);
    setSelectedOptionals([]);
    setSelectedGroupItems({});
    setItemNotes('');
  }

  function cartItemTotal(it: CartItem): number {
    const opts = it.selectedOptionals.reduce((s, o) => s + o.price, 0);
    let groupExtras = 0;
    if (it.groupedOptionalNames) {
      // groupedOptionalNames already represented in display name; price already computed when added
      // but we need to recompute extras from selection => approximate via parsing
      it.groupedOptionalNames.forEach(line => {
        const matches = line.matchAll(/R\$\s*([\d.,]+)/g);
        for (const m of matches) {
          const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
          if (Number.isFinite(v)) groupExtras += v;
        }
      });
    }
    return (it.product.price + opts + groupExtras) * it.quantity;
  }

  const cartTotal = cart.reduce((s, it) => s + cartItemTotal(it), 0);
  const cartCount = cart.reduce((s, it) => s + it.quantity, 0);

  function buildItemDisplayName(it: CartItem): string {
    let name = it.product.name;
    if (it.selectedOptionals.length > 0) {
      name += ` (${it.selectedOptionals.map(o => o.name).join(', ')})`;
    }
    if (it.groupedOptionalNames && it.groupedOptionalNames.length > 0) {
      name += ` [${it.groupedOptionalNames.join(' | ')}]`;
    }
    return name;
  }

  async function confirmOrder() {
    if (!companyId || !selectedMesa || cart.length === 0) return;
    setSubmitting(true);
    try {
      const items = cart.map(it => {
        const unit = cartItemTotal(it) / it.quantity;
        return {
          productId: it.product.id,
          productName: buildItemDisplayName(it),
          quantity: it.quantity,
          unitPrice: unit,
          notes: it.notes || null,
        };
      });
      const { data, error } = await supabase.functions.invoke('mesa-public', {
        body: {
          action: 'submit-order',
          companyId,
          tableNumber: selectedMesa.number,
          items,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuccessInfo({ tabNumber: data.tabNumber, tableNumber: data.tableNumber });
      setCart([]);
      setCartOpen(false);
      await refreshBoot();
    } catch (e: any) {
      toast.error('Erro ao enviar pedido: ' + (e?.message || ''));
    } finally {
      setSubmitting(false);
    }
  }

  // ================ RENDER ================

  if (bootLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (bootError || !companyId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card><CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Loja não encontrada</p>
        </CardContent></Card>
      </div>
    );
  }

  if (!moduleEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md"><CardContent className="py-8 text-center space-y-2">
          <h2 className="text-lg font-bold">Cardápio de Mesa indisponível</h2>
          <p className="text-sm text-muted-foreground">Esta loja não tem o cardápio de mesa habilitado no momento.</p>
        </CardContent></Card>
      </div>
    );
  }

  if (successInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full"><CardContent className="py-10 text-center space-y-4">
          <div className="flex justify-center"><CheckCircle className="w-16 h-16 text-green-500" /></div>
          <h2 className="text-xl font-bold">Pedido enviado!</h2>
          <p className="text-sm text-muted-foreground">
            Mesa <strong>{successInfo.tableNumber}</strong> · Comanda <strong>#{successInfo.tabNumber}</strong>
          </p>
          <p className="text-xs text-muted-foreground">Em breve seu pedido será preparado. Bom apetite!</p>
          <div className="flex flex-col gap-2 pt-4">
            <Button onClick={() => setSuccessInfo(null)}>Adicionar mais itens</Button>
            <Button variant="outline" onClick={() => { setSuccessInfo(null); setSelectedMesa(null); setTableInput(''); }}>
              Trocar de mesa
            </Button>
          </div>
        </CardContent></Card>
      </div>
    );
  }

  // Step 1: prompt mesa
  if (!selectedMesa) {
    function trySelect() {
      const n = parseInt(tableInput, 10);
      if (!Number.isFinite(n) || n <= 0) {
        toast.error('Informe um número de mesa válido');
        return;
      }
      const mesa = mesas.find(m => m.number === n);
      if (!mesa) {
        toast.error(`Mesa ${n} não encontrada`);
        return;
      }
      setSelectedMesa(mesa);
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full"><CardContent className="py-8 space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold">{companyName}</h1>
            <p className="text-sm text-muted-foreground">Cardápio de Mesa</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mesa-num">Número da sua mesa</Label>
            <Input
              id="mesa-num"
              type="number"
              inputMode="numeric"
              min={1}
              value={tableInput}
              onChange={e => setTableInput(e.target.value)}
              placeholder="Ex: 5"
              className="text-center text-2xl h-14"
              onKeyDown={e => { if (e.key === 'Enter') trySelect(); }}
            />
          </div>
          <Button className="w-full h-12" onClick={trySelect}>Acessar cardápio</Button>
          <p className="text-xs text-center text-muted-foreground">
            Confira o número da mesa no cartão sobre ela
          </p>
        </CardContent></Card>
      </div>
    );
  }

  // Step 2: cardápio
  const orderedCategories = Array.from(new Set(waiterProducts.map(p => p.category)));
  const categoriesWithProducts = categories
    .filter(c => orderedCategories.includes(c.name))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Mesa</p>
            <h1 className="text-lg font-bold truncate">
              Mesa {selectedMesa.number}
              {selectedMesa.hasOpenTab && (
                <Badge variant="outline" className="ml-2 text-xs">Comanda aberta</Badge>
              )}
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSelectedMesa(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Trocar mesa
          </Button>
        </div>
        {selectedMesa.hasOpenTab && (
          <div className="bg-primary/5 border-t border-primary/20 px-4 py-2 text-xs text-center text-primary">
            Adicionando itens à comanda #{selectedMesa.tabNumber} desta mesa
          </div>
        )}
      </div>

      <main className="container mx-auto px-4 py-4 space-y-6">
        {categoriesWithProducts.length === 0 && (
          <Card><CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nenhum produto disponível</p>
          </CardContent></Card>
        )}
        {categoriesWithProducts.map(cat => {
          const items = waiterProducts
            .filter(p => p.category === cat.name)
            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
          if (items.length === 0) return null;
          return (
            <section key={cat.id} className="space-y-2">
              <h2 className="text-base font-bold flex items-center gap-2">
                {cat.emoji && <span>{cat.emoji}</span>}
                {cat.name}
              </h2>
              <div className="space-y-2">
                {items.map(p => (
                  <Card
                    key={p.id}
                    className="cursor-pointer hover:border-primary transition-colors overflow-hidden"
                    onClick={() => setSelectedProduct(p)}
                  >
                    <CardContent className="p-0">
                      <div className="flex">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-24 h-24 object-cover flex-shrink-0" loading="lazy" />
                        ) : (
                          <div className="w-24 h-24 bg-muted flex-shrink-0" />
                        )}
                        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                          <div>
                            <h3 className="font-semibold text-sm line-clamp-2">{p.name}</h3>
                            {p.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.description}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-green-600 font-bold text-sm">R$ {formatPrice(p.price)}</span>
                            <Button size="sm" className="h-8 px-2"><Plus className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {/* Floating cart */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-30">
          <Button className="w-full py-6 shadow-lg" size="lg" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="w-5 h-5 mr-2" />
            Ver carrinho ({cartCount}) — R$ {formatPrice(cartTotal)}
          </Button>
        </div>
      )}

      {/* Product dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={open => {
        if (!open) { setSelectedProduct(null); setSelectedOptionals([]); setSelectedGroupItems({}); setItemNotes(''); }
      }}>
        <DialogContent className="max-h-[85dvh] flex flex-col p-0 gap-0 overflow-hidden" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>{selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {selectedProduct && (
              <>
                {selectedProduct.imageUrl && (
                  <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-48 object-cover" />
                )}
                <div className="px-6 py-4">
                  {(selectedProductGroups.length > 0 || (selectedProduct.optionals && selectedProduct.optionals.filter(o => o.active).length > 0)) ? (
                    <LateralOptionalsWizard
                      product={selectedProduct}
                      groups={selectedProductGroups as any}
                      oldStyleOptionals={selectedProduct.optionals?.filter(o => o.active) || []}
                      selectedOptionals={selectedOptionals}
                      selectedGroupItems={selectedGroupItems}
                      itemNotes={itemNotes}
                      onToggleOptional={toggleOptional}
                      onToggleGroupItem={toggleGroupItem}
                      onChangeGroupItemQty={changeGroupItemQty}
                      onNotesChange={setItemNotes}
                      onAddToCart={addToCart}
                      isI9
                    />
                  ) : (
                    <div className="space-y-4">
                      {selectedProduct.description && (
                        <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>
                      )}
                      <p className="text-2xl font-bold text-green-600">R$ {formatPrice(selectedProduct.price)}</p>
                      <div>
                        <Label>Observações</Label>
                        <Input value={itemNotes} onChange={e => setItemNotes(e.target.value)} placeholder="Ex: sem cebola" />
                      </div>
                      <Button className="w-full" size="lg" onClick={addToCart}>
                        Adicionar ao carrinho — R$ {formatPrice(selectedProduct.price)}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cart sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] flex flex-col p-0">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Seu pedido — Mesa {selectedMesa.number}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Carrinho vazio</p>
            )}
            {cart.map((it, idx) => (
              <Card key={idx}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{it.product.name}</p>
                      {it.selectedOptionals.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {it.selectedOptionals.map(o => o.name).join(', ')}
                        </p>
                      )}
                      {it.groupedOptionalNames?.map((g, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{g}</p>
                      ))}
                      {it.notes && <p className="text-xs italic">"{it.notes}"</p>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setCart(cart.filter((_, i) => i !== idx))}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                        onClick={() => setCart(cart.map((c, i) => i === idx ? { ...c, quantity: Math.max(1, c.quantity - 1) } : c))}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="text-sm font-semibold w-6 text-center">{it.quantity}</span>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                        onClick={() => setCart(cart.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c))}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <span className="text-green-600 font-bold text-sm">R$ {formatPrice(cartItemTotal(it))}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="border-t p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold text-green-600">R$ {formatPrice(cartTotal)}</span>
            </div>
            <Button
              className="w-full h-12"
              onClick={confirmOrder}
              disabled={submitting || cart.length === 0}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar pedido'}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              O pagamento será feito ao garçom no fechamento da mesa
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
