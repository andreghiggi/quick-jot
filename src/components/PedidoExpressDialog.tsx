import { useState, useMemo, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useOptionalGroups, OptionalGroup } from '@/hooks/useOptionalGroups';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useAuthContext } from '@/contexts/AuthContext';
import { useOrderContext } from '@/contexts/OrderContext';
import { OrderItem } from '@/types/order';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Minus, ShoppingBag, X, Loader2, ArrowLeft, ArrowRight, Phone, User, Package, MapPin, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PedidoExpressDialogProps {
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

type Step = 1 | 2 | 3 | 4 | 5;

export function PedidoExpressDialog({ open, onOpenChange }: PedidoExpressDialogProps) {
  const { addOrder } = useOrderContext();
  const { company } = useAuthContext();
  const { products, loading: productsLoading, getCategories, getActiveProducts } = useProducts({ companyId: company?.id });
  const { categories } = useCategories({ companyId: company?.id });
  const { groups: optionalGroups, loading: groupsLoading } = useOptionalGroups({ companyId: company?.id });
  const { activePaymentMethods, loading: paymentLoading } = usePaymentMethods({ companyId: company?.id });

  // New step order: 1=Products, 2=Phone, 3=Name, 4=Delivery, 5=Payment
  const [step, setStep] = useState<Step>(1);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerFound, setCustomerFound] = useState(false);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectingProduct, setSelectingProduct] = useState<{ id: string; name: string; price: number; category: string } | null>(null);
  const [selectedOptionals, setSelectedOptionals] = useState<Record<string, Set<string>>>({});

  const [deliveryType, setDeliveryType] = useState<'entrega' | 'retirada' | ''>('');
  // Address fields matching checkout exactly
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryComplement, setDeliveryComplement] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');

  const [paymentMethod, setPaymentMethod] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeProducts = getActiveProducts();
  const productCategories = getCategories();

  const currentCategory = selectedCategory && productCategories.includes(selectedCategory)
    ? selectedCategory
    : productCategories[0] || null;

  const filteredProducts = useMemo(() => {
    if (!currentCategory) return activeProducts;
    return activeProducts.filter((p) => p.category === currentCategory);
  }, [activeProducts, currentCategory]);

  const categoryIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { map[c.name] = c.id; });
    return map;
  }, [categories]);

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

  // Phone formatting
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const phoneDigits = customerPhone.replace(/\D/g, '');

  // Search customer when phone is complete
  const searchCustomer = useCallback(async (phone: string) => {
    if (!company?.id || phone.length < 10) return;
    setSearchingCustomer(true);
    try {
      const { data } = await supabase
        .from('customers')
        .select('name')
        .eq('company_id', company.id)
        .eq('phone', phone)
        .maybeSingle();

      if (data?.name) {
        setCustomerName(data.name);
        setCustomerFound(true);
      } else {
        setCustomerFound(false);
      }
    } catch {
      setCustomerFound(false);
    } finally {
      setSearchingCustomer(false);
    }
  }, [company?.id]);

  useEffect(() => {
    if (phoneDigits.length >= 10) {
      searchCustomer(phoneDigits);
    } else {
      setCustomerFound(false);
      setCustomerName('');
    }
  }, [phoneDigits, searchCustomer]);

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
    const applicableGroups = getGroupsForProduct(product.id, product.category);

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

  const selectingGroups = useMemo(() => {
    if (!selectingProduct) return [];
    const productData = activeProducts.find(p => p.id === selectingProduct.id);
    return productData ? getGroupsForProduct(selectingProduct.id, productData.category) : [];
  }, [selectingProduct, activeProducts, optionalGroups, categoryIdByName]);

  // Step order: 1=Products, 2=Phone, 3=Name, 4=Delivery, 5=Payment
  function canGoNext(): boolean {
    switch (step) {
      case 1: return cart.length > 0;
      case 2: return phoneDigits.length >= 10;
      case 3: return customerName.trim().length >= 2;
      case 4:
        if (!deliveryType) return false;
        if (deliveryType === 'entrega') return !!(deliveryAddress.trim() && deliveryNumber.trim() && deliveryNeighborhood.trim() && deliveryReference.trim());
        return true;
      case 5: return !!paymentMethod;
      default: return false;
    }
  }

  function goNext() {
    if (!canGoNext()) return;
    if (step < 5) setStep((step + 1) as Step);
  }

  function goBack() {
    if (step > 1) setStep((step - 1) as Step);
  }

  async function handleSubmit() {
    if (!canGoNext()) return;

    setIsSubmitting(true);

    const selectedPM = activePaymentMethods.find(m => m.id === paymentMethod);
    const paymentName = selectedPM?.name || '';
    const deliveryTypeLabel = deliveryType === 'entrega' ? 'Entrega' : 'Retirada';
    const fullAddress = deliveryType === 'entrega'
      ? `${deliveryAddress}, ${deliveryNumber}${deliveryComplement ? ` - ${deliveryComplement}` : ''} - ${deliveryNeighborhood}${deliveryReference ? ` | Ref: ${deliveryReference}` : ''}`
      : '';

    const noteParts = [`Pagamento: ${paymentName}`, deliveryTypeLabel];
    const noteStr = noteParts.join(' | ');

    const orderItems: OrderItem[] = cart.map(item => {
      const optDesc = item.optionals.length > 0
        ? ` (${item.optionals.map(o => `${o.groupName}: ${o.itemName}`).join(', ')})`
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
      customerPhone: phoneDigits || undefined,
      deliveryAddress: fullAddress || undefined,
      notes: noteStr,
      items: orderItems,
      total,
      status: 'pending',
    });

    if (success) {
      // If PIX was selected, send PIX key via WhatsApp
      if (selectedPM?.name?.toLowerCase().includes('pix') && selectedPM.pix_key && phoneDigits) {
        await sendPixKeyViaWhatsApp(phoneDigits, selectedPM.pix_key);
      }

      toast.success('Pedido Express criado com sucesso!');
      resetForm();
      onOpenChange(false);
    }

    setIsSubmitting(false);
  }

  async function sendPixKeyViaWhatsApp(phone: string, pixKey: string) {
    if (!company?.id) return;
    try {
      const { data: instanceData } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, status')
        .eq('company_id', company.id)
        .maybeSingle();

      if (!instanceData || instanceData.status !== 'connected') return;

      const message = `💳 *Pagamento via PIX*\n\nChave PIX: *${pixKey}*\n\nValor: *R$ ${total.toFixed(2)}*\n\nApós o pagamento, seu pedido será preparado! 😊`;

      await supabase.functions.invoke('whatsapp-evolution', {
        body: {
          action: 'send_message',
          instanceName: instanceData.instance_name,
          phone,
          message,
          companyId: company.id,
        },
      });

      toast.success('Chave PIX enviada via WhatsApp!');
    } catch (err) {
      console.error('Failed to send PIX key via WhatsApp:', err);
    }
  }

  function resetForm() {
    setStep(1);
    setCustomerPhone('');
    setCustomerName('');
    setCustomerFound(false);
    setCart([]);
    setSelectedCategory(null);
    setSelectingProduct(null);
    setSelectedOptionals({});
    setDeliveryType('');
    setDeliveryAddress('');
    setDeliveryNumber('');
    setDeliveryComplement('');
    setDeliveryNeighborhood('');
    setDeliveryReference('');
    setPaymentMethod('');
  }

  // Updated step labels: Products → Phone → Name → Delivery → Payment
  const stepLabels = [
    { icon: Package, label: 'Produtos' },
    { icon: Phone, label: 'Telefone' },
    { icon: User, label: 'Nome' },
    { icon: MapPin, label: 'Entrega' },
    { icon: CreditCard, label: 'Pagamento' },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Pedido Express</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-between px-2 py-2">
          {stepLabels.map((s, i) => {
            const Icon = s.icon;
            const stepNum = (i + 1) as Step;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isDone && "bg-primary/20 text-primary",
                  !isActive && !isDone && "bg-muted text-muted-foreground"
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={cn("text-[10px]", isActive ? "text-primary font-semibold" : "text-muted-foreground")}>{s.label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Step 1: Products */}
          {step === 1 && (
            <div className="space-y-3">
              {productsLoading || groupsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Carregando...</span>
                </div>
              ) : activeProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum produto cadastrado.
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
                            "p-3 rounded-lg border border-border bg-card hover:border-green-400/50 transition-colors",
                            quantity > 0 && "border-green-500 bg-green-50 dark:bg-green-950/30"
                          )}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <p className="font-medium text-sm text-foreground">{product.name}</p>
                              <p className="text-green-600 dark:text-green-400 font-semibold">R$ {product.price.toFixed(2)}</p>
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
                    <span className="font-semibold">Resumo ({cart.reduce((s, i) => s + i.quantity, 0)} itens)</span>
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
                              <span key={i}>{o.groupName}: {o.itemName}{o.price > 0 ? ` (+R$${o.price.toFixed(2)})` : ''}{i < item.optionals.length - 1 ? ', ' : ''}</span>
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
            </div>
          )}

          {/* Step 2: Phone */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="font-bold">Telefone do Cliente *</Label>
                <Input
                  id="phone"
                  placeholder="(00) 00000-0000"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(formatPhone(e.target.value))}
                  className="h-14 text-lg"
                  autoFocus
                />
                {searchingCustomer && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Buscando cliente...
                  </p>
                )}
                {customerFound && (
                  <p className="text-sm text-green-600 font-medium">✓ Cliente encontrado: {customerName}</p>
                )}
                {phoneDigits.length >= 10 && !searchingCustomer && !customerFound && (
                  <p className="text-sm text-muted-foreground">Cliente não encontrado. Preencha o nome no próximo passo.</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Name */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="font-bold">Nome Completo *</Label>
                <Input
                  id="name"
                  placeholder="Nome do cliente"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-14 text-lg"
                  autoFocus
                />
                {customerFound && (
                  <p className="text-xs text-muted-foreground">Nome preenchido automaticamente da base de clientes.</p>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Delivery Type */}
          {step === 4 && (
            <div className="space-y-4">
              <Label className="font-bold">Tipo de entrega *</Label>
              <RadioGroup value={deliveryType} onValueChange={(v) => setDeliveryType(v as 'entrega' | 'retirada')}>
                <div className="grid grid-cols-2 gap-3">
                  {(['entrega', 'retirada'] as const).map(type => (
                    <label
                      key={type}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                        deliveryType === type ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                      )}
                    >
                      <RadioGroupItem value={type} />
                      <span className="font-medium capitalize">{type === 'entrega' ? '🛵 Entrega' : '🏪 Retirada'}</span>
                    </label>
                  ))}
                </div>
              </RadioGroup>

              {deliveryType === 'entrega' && (
                <div className="space-y-3 mt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_92px] sm:items-end">
                    <div className="min-w-0">
                      <Label className="block leading-snug whitespace-normal break-words font-bold">Logradouro (rua, avenida, travessa) *</Label>
                      <Input
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Ex: Rua das Flores"
                        className="border-primary"
                      />
                    </div>
                    <div className="min-w-0">
                      <Label className="block leading-snug whitespace-nowrap font-bold">Número *</Label>
                      <Input
                        value={deliveryNumber}
                        onChange={(e) => setDeliveryNumber(e.target.value)}
                        placeholder="123"
                        inputMode="numeric"
                        className="border-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="font-bold">Complemento</Label>
                    <Input
                      value={deliveryComplement}
                      onChange={(e) => setDeliveryComplement(e.target.value)}
                      placeholder="Apto 01, Sala 02..."
                      className="border-primary"
                    />
                  </div>
                  <div>
                    <Label className="font-bold">Bairro *</Label>
                    <Input
                      value={deliveryNeighborhood}
                      onChange={(e) => setDeliveryNeighborhood(e.target.value)}
                      placeholder="Nome do bairro"
                      className="border-primary"
                    />
                  </div>
                  <div>
                    <Label className="font-bold">Ponto de referência *</Label>
                    <Input
                      value={deliveryReference}
                      onChange={(e) => setDeliveryReference(e.target.value)}
                      placeholder="Próximo ao mercado, em frente à escola..."
                      className="border-primary"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Payment */}
          {step === 5 && (
            <div className="space-y-4">
              <Label className="font-bold">Forma de pagamento *</Label>
              {paymentLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
              ) : activePaymentMethods.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Nenhuma forma de pagamento cadastrada.</p>
              ) : (
                <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                  <div className="grid grid-cols-2 gap-3">
                    {activePaymentMethods.map(pm => (
                      <label
                        key={pm.id}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                          paymentMethod === pm.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                        )}
                      >
                        <RadioGroupItem value={pm.id} />
                        <span className="font-medium">{pm.name}</span>
                      </label>
                    ))}
                  </div>
                </RadioGroup>
              )}

              {/* Order summary */}
              {cart.length > 0 && (
                <div className="bg-muted rounded-lg p-4 space-y-2 mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ShoppingBag className="w-4 h-4 text-primary" />
                    <span className="font-semibold">Resumo Final</span>
                  </div>
                  <p className="text-sm"><strong>Cliente:</strong> {customerName}</p>
                  <p className="text-sm"><strong>Telefone:</strong> {customerPhone}</p>
                  <p className="text-sm"><strong>Tipo:</strong> {deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}</p>
                  {deliveryType === 'entrega' && (
                    <p className="text-sm"><strong>Endereço:</strong> {deliveryAddress}, {deliveryNumber}{deliveryComplement ? ` - ${deliveryComplement}` : ''} - {deliveryNeighborhood}{deliveryReference ? ` (Ref: ${deliveryReference})` : ''}</p>
                  )}
                  <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">R$ {total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3 pt-4 border-t border-border mt-4">
          {step > 1 ? (
            <Button variant="outline" className="flex-1 gap-2" onClick={goBack}>
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" onClick={() => { resetForm(); onOpenChange(false); }}>
              Cancelar
            </Button>
          )}

          {step < 5 ? (
            <Button className="flex-1 gap-2" onClick={goNext} disabled={!canGoNext()}>
              Avançar <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={!canGoNext() || isSubmitting}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : '✅ Confirmar Pedido'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
