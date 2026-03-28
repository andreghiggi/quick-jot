import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useOptionalGroups, OptionalGroup } from '@/hooks/useOptionalGroups';
import { useAuthContext } from '@/contexts/AuthContext';
import { useOrderContext } from '@/contexts/OrderContext';
import { OrderItem } from '@/types/order';
import { Plus, Minus, ShoppingBag, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CartItemOptional {
  groupName: string;
  itemName: string;
  price: number;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  optionals: CartItemOptional[];
}

export function NewOrderDialog({ open, onOpenChange }: NewOrderDialogProps) {
  const { addOrder } = useOrderContext();
  const { company } = useAuthContext();
  const { products, loading: productsLoading, getCategories, getActiveProducts } = useProducts({ companyId: company?.id });
  const { categories } = useCategories({ companyId: company?.id });
  const { groups: optionalGroups, loading: groupsLoading } = useOptionalGroups({ companyId: company?.id });

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Optional group selection for a product being added
  const [selectingProduct, setSelectingProduct] = useState<{ id: string; name: string; price: number } | null>(null);
  const [selectedOptionals, setSelectedOptionals] = useState<Record<string, Set<string>>>({});

  const activeProducts = getActiveProducts();
  const productCategories = getCategories();

  const currentCategory = selectedCategory && productCategories.includes(selectedCategory)
    ? selectedCategory
    : productCategories[0] || null;

  const filteredProducts = useMemo(() => {
    if (!currentCategory) return activeProducts;
    return activeProducts.filter((p) => p.category === currentCategory);
  }, [activeProducts, currentCategory]);

  // Build category name -> id map
  const categoryIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { map[c.name] = c.id; });
    return map;
  }, [categories]);

  // Get groups for a product (with per-product overrides)
  function getGroupsForProduct(productId: string, productCategory: string): OptionalGroup[] {
    const catId = categoryIdByName[productCategory];
    return optionalGroups
      .filter(g => {
        if (!g.active) return false;
        if (g.productIds.includes(productId)) return true;
        if (catId && g.categoryIds.includes(catId)) return true;
        return false;
      })
      .map(g => {
        const override = g.productOverrides?.find(o => o.productId === productId);
        if (override && (override.minSelectOverride !== null || override.maxSelectOverride !== null)) {
          return {
            ...g,
            minSelect: override.minSelectOverride ?? g.minSelect,
            maxSelect: override.maxSelectOverride ?? g.maxSelect,
          };
        }
        return g;
      });
  }

  const total = cart.reduce((sum, item) => {
    const optTotal = item.optionals.reduce((s, o) => s + o.price, 0);
    return sum + (item.price + optTotal) * item.quantity;
  }, 0);

  function handleProductClick(product: { id: string; name: string; price: number; category: string }) {
    const applicableGroups = getGroupsForProduct(product.id, product.category);
    if (applicableGroups.length > 0) {
      setSelectingProduct(product);
      setSelectedOptionals({});
    } else {
      addToCartSimple(product);
    }
  }

  function addToCartSimple(product: { id: string; name: string; price: number }) {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.optionals.length === 0);
      if (existing) {
        return prev.map(item =>
          item.id === product.id && item.optionals.length === 0 ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, quantity: 1, optionals: [] }];
    });
  }

  function confirmOptionals() {
    if (!selectingProduct) return;
    const product = selectingProduct;
    const productData = activeProducts.find(p => p.id === product.id);
    const applicableGroups = productData ? getGroupsForProduct(product.id, productData.category) : [];

    // Validate min selections
    for (const group of applicableGroups) {
      const selected = selectedOptionals[group.id];
      const count = selected ? selected.size : 0;
      if (group.minSelect > 0 && count < group.minSelect) {
        toast.error(`Selecione pelo menos ${group.minSelect} item(ns) em "${group.name}"`);
        return;
      }
    }

    const opts: CartItemOptional[] = [];
    for (const group of applicableGroups) {
      const selected = selectedOptionals[group.id];
      if (!selected) continue;
      for (const item of group.items) {
        if (selected.has(item.id)) {
          opts.push({ groupName: group.name, itemName: item.name, price: item.price });
        }
      }
    }

    // Use a unique key combining product + optionals
    const cartKey = `${product.id}_${opts.map(o => o.itemName).sort().join(',')}`;
    setCart(prev => [...prev, { id: cartKey, name: product.name, price: product.price, quantity: 1, optionals: opts }]);
    setSelectingProduct(null);
    setSelectedOptionals({});
  }

  function toggleOptionalItem(groupId: string, itemId: string, maxSelect: number) {
    setSelectedOptionals(prev => {
      const current = new Set(prev[groupId] || []);
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        if (maxSelect > 0 && current.size >= maxSelect) {
          toast.error(`Máximo ${maxSelect} seleções neste grupo`);
          return prev;
        }
        current.add(itemId);
      }
      return { ...prev, [groupId]: current };
    });
  }

  function removeFromCart(cartKey: string) {
    setCart(prev => {
      const existing = prev.find(item => item.id === cartKey);
      if (existing && existing.quantity > 1) {
        return prev.map(item =>
          item.id === cartKey ? { ...item, quantity: item.quantity - 1 } : item
        );
      }
      return prev.filter(item => item.id !== cartKey);
    });
  }

  function getCartQuantity(productId: string): number {
    return cart.filter(item => item.id === productId || item.id.startsWith(productId + '_')).reduce((s, i) => s + i.quantity, 0);
  }

  async function handleSubmit() {
    if (!customerName.trim()) {
      toast.error('Informe o nome completo do cliente');
      return;
    }
    const nameParts = customerName.trim().split(/\s+/);
    if (nameParts.length < 2 || nameParts.some(p => p.length < 2)) {
      toast.error('Informe nome e sobrenome do cliente');
      return;
    }
    if (cart.length === 0) {
      toast.error('Adicione pelo menos um item ao pedido');
      return;
    }

    setIsSubmitting(true);

    const orderItems: OrderItem[] = cart.map(item => {
      const optDesc = item.optionals.length > 0
        ? ` (${item.optionals.map(o => o.itemName).join(', ')})`
        : '';
      const optPrice = item.optionals.reduce((s, o) => s + o.price, 0);
      return {
        id: crypto.randomUUID(),
        productId: item.id.split('_')[0],
        name: item.name + optDesc,
        quantity: item.quantity,
        price: item.price + optPrice,
      };
    });

    const success = await addOrder({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      notes: notes.trim() || undefined,
      items: orderItems,
      total,
      status: 'pending',
    });

    setIsSubmitting(false);
    if (success) {
      toast.success('Pedido criado com sucesso!');
      resetForm();
      onOpenChange(false);
    }
  }

  function resetForm() {
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setNotes('');
    setCart([]);
    setSelectedCategory(null);
    setSelectingProduct(null);
    setSelectedOptionals({});
  }

  // Get applicable groups for the product being selected
  const selectingGroups = useMemo(() => {
    if (!selectingProduct) return [];
    const productData = activeProducts.find(p => p.id === selectingProduct.id);
    return productData ? getGroupsForProduct(selectingProduct.id, productData.category) : [];
  }, [selectingProduct, activeProducts, optionalGroups, categoryIdByName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Novo Pedido</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {/* Customer Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Nome do cliente *</Label>
              <Input id="customerName" placeholder="Nome do cliente" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Telefone</Label>
              <Input id="customerPhone" placeholder="(00) 00000-0000" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliveryAddress">Endereço de entrega</Label>
            <Input id="deliveryAddress" placeholder="Rua, número, bairro..." value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
          </div>

          {/* Products */}
          <div className="space-y-3">
            <Label>Produtos</Label>
            {productsLoading || groupsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Carregando...</span>
              </div>
            ) : activeProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum produto cadastrado. Cadastre produtos na aba Produtos.
              </div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  {productCategories.map((category) => (
                    <Badge
                      key={category}
                      variant={currentCategory === category ? 'default' : 'outline'}
                      className={cn('cursor-pointer transition-all', currentCategory === category && 'shadow-primary')}
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category}
                    </Badge>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {filteredProducts.map((product) => {
                    const quantity = getCartQuantity(product.id);
                    return (
                      <div
                        key={product.id}
                        className={cn(
                          "p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors",
                          quantity > 0 && "border-primary bg-accent"
                        )}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-medium text-sm text-foreground">{product.name}</p>
                            <p className="text-primary font-semibold">R$ {product.price.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          {quantity > 0 && (
                            <>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => removeFromCart(product.id)}>
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-6 text-center font-semibold">{quantity}</span>
                            </>
                          )}
                          <Button size="icon" variant={quantity > 0 ? 'default' : 'outline'} className="h-7 w-7" onClick={() => handleProductClick(product)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Optional Groups Selection */}
          {selectingProduct && (
            <div className="bg-muted rounded-lg p-4 space-y-4 border-2 border-primary">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Adicionais para: {selectingProduct.name}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectingProduct(null); setSelectedOptionals({}); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {selectingGroups.map(group => (
                <div key={group.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{group.name}</p>
                    {(group.minSelect > 0 || group.maxSelect > 0) && (
                      <Badge variant="outline" className="text-xs">
                        {group.minSelect > 0 ? `mín ${group.minSelect}` : ''}
                        {group.minSelect > 0 && group.maxSelect > 0 ? ' / ' : ''}
                        {group.maxSelect > 0 ? `máx ${group.maxSelect}` : ''}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    {group.items.filter(i => i.active).map(item => {
                      const isSelected = selectedOptionals[group.id]?.has(item.id) || false;
                      return (
                        <label key={item.id} className="flex items-center gap-2 cursor-pointer py-1 px-2 rounded hover:bg-background/50">
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleOptionalItem(group.id, item.id, group.maxSelect)} />
                          <span className="text-sm flex-1">{item.name}</span>
                          {item.price > 0 && <span className="text-xs text-muted-foreground">+R$ {item.price.toFixed(2)}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <Button onClick={confirmOptionals} className="w-full" size="sm">Confirmar Adicionais</Button>
            </div>
          )}

          {/* Cart Summary */}
          {cart.length > 0 && (
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <span className="font-semibold">Resumo do pedido</span>
              </div>
              {cart.map((item) => {
                const optTotal = item.optionals.reduce((s, o) => s + o.price, 0);
                return (
                  <div key={item.id} className="text-sm">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                        <span>{item.quantity}x {item.name}</span>
                      </div>
                      <span className="text-muted-foreground">R$ {((item.price + optTotal) * item.quantity).toFixed(2)}</span>
                    </div>
                    {item.optionals.length > 0 && (
                      <div className="ml-7 text-xs text-muted-foreground">
                        {item.optionals.map((o, i) => (
                          <span key={i}>{o.itemName}{o.price > 0 ? ` (+R$${o.price.toFixed(2)})` : ''}{i < item.optionals.length - 1 ? ', ' : ''}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary">R$ {total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" placeholder="Observações do pedido..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-border mt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : 'Criar Pedido'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
