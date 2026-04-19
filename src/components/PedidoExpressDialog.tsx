import { useState, useMemo, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useOptionalGroups, OptionalGroup } from '@/hooks/useOptionalGroups';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useDeliveryNeighborhoods } from '@/hooks/useDeliveryNeighborhoods';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthContext } from '@/contexts/AuthContext';
import { useOrderContext } from '@/contexts/OrderContext';
import { OrderItem } from '@/types/order';
import { Product, ProductOptional, CartItem } from '@/types/product';
import { LateralOptionalsWizard } from '@/components/menu/LateralOptionalsWizard';
import { supabase } from '@/integrations/supabase/client';
import { generateProductionTicketHTML } from '@/utils/printProductionTicket';
import { PDVV2DocumentModeSelector, DocumentMode } from '@/components/pdv-v2/PDVV2DocumentModeSelector';
import { PDVV2PaymentDialog } from '@/components/pdv-v2/PDVV2PaymentDialog';
import { Plus, Minus, ShoppingBag, X, Loader2, ArrowLeft, ArrowRight, Phone, User, Package, MapPin, CreditCard } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { toast } from 'sonner';

interface PedidoExpressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

export function PedidoExpressDialog({ open, onOpenChange }: PedidoExpressDialogProps) {
  const { addOrder } = useOrderContext();
  const { company } = useAuthContext();
  const { products, loading: productsLoading, getCategories, getActiveProducts } = useProducts({ companyId: company?.id });
  const { categories } = useCategories({ companyId: company?.id });
  const { groups: optionalGroups, loading: groupsLoading } = useOptionalGroups({ companyId: company?.id });
  const { activePaymentMethods, loading: paymentLoading } = usePaymentMethods({ companyId: company?.id, channel: 'express' });
  const { settings } = useStoreSettings({ companyId: company?.id });
  const { getActiveNeighborhoods } = useDeliveryNeighborhoods({ companyId: company?.id });
  const activeNeighborhoods = getActiveNeighborhoods();
  const useNeighborhoodDeliveryMode = settings.deliveryMode === 'neighborhood' && activeNeighborhoods.length > 0;

  const [step, setStep] = useState<Step>(1);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerFound, setCustomerFound] = useState(false);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  // Cart uses the same CartItem type as the online catalog
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Product detail dialog state — mirrors Menu.tsx exactly
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOptionals, setSelectedOptionals] = useState<ProductOptional[]>([]);
  const [selectedGroupItems, setSelectedGroupItems] = useState<Record<string, Set<string>>>({});
  const [itemNotes, setItemNotes] = useState('');

  const [deliveryType, setDeliveryType] = useState<'entrega' | 'retirada' | ''>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryComplement, setDeliveryComplement] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [selectedDeliveryFeeType, setSelectedDeliveryFeeType] = useState<'city' | 'interior' | ''>('');

  const [paymentMethod, setPaymentMethod] = useState('');
  const [documentMode, setDocumentMode] = useState<DocumentMode>(() => {
    const saved = localStorage.getItem('pdv_document_mode');
    return saved === 'sale_with_nfce' ? 'sale_with_nfce' : 'sale_only';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Cobrança via PDVV2PaymentDialog (apenas Retirada)
  const [pickupChargeOpen, setPickupChargeOpen] = useState(false);

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

  // Reuse the same getGroupsForProduct logic as Menu.tsx
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

  // Get groups for currently selected product (same as Menu.tsx)
  const selectedProductGroups = useMemo(() => {
    if (!selectedProduct) return [];
    return getGroupsForProduct(selectedProduct.id, selectedProduct.category)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [selectedProduct, optionalGroups, categoryIdByName]);

  // Calculate total using catalog CartItem type
  function calculateItemTotal(item: CartItem): number {
    const optionalsTotal = item.selectedOptionals.reduce((sum, opt) => sum + opt.price, 0);
    return (item.product.price + optionalsTotal) * item.quantity;
  }

  const subtotal = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const total = subtotal + (deliveryType === 'entrega' ? deliveryFee : 0);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const phoneDigits = customerPhone.replace(/\D/g, '');

  const searchCustomer = useCallback(async (phone: string) => {
    if (!company?.id || phone.length < 10) return;
    setSearchingCustomer(true);
    try {
      const { data } = await supabase
        .from('customers')
        .select('name, address')
        .eq('company_id', company.id)
        .eq('phone', phone)
        .maybeSingle();
      if (data?.name) {
        setCustomerName(data.name);
        setCustomerFound(true);
        // Auto-fill address fields from saved customer address
        if (data.address) {
          try {
            // Try parsing structured address: "Rua, Número - Complemento - Bairro | Ref: Referência"
            const addr = data.address;
            const refMatch = addr.match(/\|\s*Ref:\s*(.+)$/i);
            const ref = refMatch ? refMatch[1].trim() : '';
            const withoutRef = refMatch ? addr.slice(0, refMatch.index).trim() : addr;
            
            const parts = withoutRef.split(' - ').map((s: string) => s.trim());
            if (parts.length >= 2) {
              // First part: "Rua, Número"
              const streetAndNum = parts[0];
              const commaIdx = streetAndNum.lastIndexOf(',');
              if (commaIdx > 0) {
                setDeliveryAddress(streetAndNum.slice(0, commaIdx).trim());
                setDeliveryNumber(streetAndNum.slice(commaIdx + 1).trim());
              } else {
                setDeliveryAddress(streetAndNum);
              }
              if (parts.length === 3) {
                setDeliveryComplement(parts[1]);
                setDeliveryNeighborhood(parts[2]);
              } else {
                setDeliveryNeighborhood(parts[1]);
              }
              setDeliveryReference(ref);
            } else {
              // Fallback: put entire address in street field
              setDeliveryAddress(addr);
            }
          } catch {
            setDeliveryAddress(data.address);
          }
        }
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

  // --- Product selection handlers (mirrors Menu.tsx) ---
  function handleProductClick(product: Product) {
    setSelectedProduct(product);
    setSelectedOptionals([]);
    setSelectedGroupItems({});
    setItemNotes('');
  }

  function toggleOptional(optional: ProductOptional) {
    setSelectedOptionals((prev) =>
      prev.find((o) => o.id === optional.id)
        ? prev.filter((o) => o.id !== optional.id)
        : [...prev, optional]
    );
  }

  function toggleGroupItem(groupId: string, itemId: string, maxSelect: number) {
    const effectiveMax = maxSelect > 0 ? maxSelect : Infinity;
    setSelectedGroupItems(prev => {
      const current = new Set(prev[groupId] || []);
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        if (current.size >= effectiveMax) {
          if (effectiveMax === 1) {
            current.clear();
            current.add(itemId);
          } else {
            toast.error(`Máximo ${effectiveMax} seleções neste grupo`);
            return prev;
          }
        } else {
          current.add(itemId);
        }
      }
      return { ...prev, [groupId]: current };
    });
  }

  // addToCart — same logic as Menu.tsx, creates a catalog CartItem
  function addToCart() {
    if (!selectedProduct) return;

    // Validate min selections
    for (const group of selectedProductGroups) {
      const selected = selectedGroupItems[group.id];
      const count = selected ? selected.size : 0;
      if (group.minSelect > 0 && count < group.minSelect) {
        toast.error(`Selecione pelo menos ${group.minSelect} item(ns) em "${group.name}"`);
        return;
      }
    }

    // Collect group optionals as ProductOptional objects
    const groupOptionals: ProductOptional[] = [];
    const groupedOptionalNames: string[] = [];
    for (const group of selectedProductGroups) {
      const selected = selectedGroupItems[group.id];
      if (!selected) continue;
      const selectedItems: { name: string; price: number }[] = [];
      for (const item of group.items) {
        if (selected.has(item.id)) {
          groupOptionals.push({
            id: item.id,
            productId: selectedProduct.id,
            name: item.name,
            price: item.price,
            type: 'extra',
            active: true,
          });
          selectedItems.push({ name: item.name, price: item.price });
        }
      }
      if (selectedItems.length > 0) {
        const itemsStr = selectedItems.map(i => i.price > 0 ? `${i.name} R$${i.price.toFixed(2)}` : i.name).join(', ');
        groupedOptionalNames.push(`${group.name}: ${itemsStr}`);
      }
    }

    const allOptionals = [...selectedOptionals, ...groupOptionals];
    if (selectedOptionals.length > 0) {
      const oldStyleStr = selectedOptionals.map(o =>
        o.price > 0 ? `${o.name} R$${o.price.toFixed(2)}` : o.name
      ).join(', ');
      groupedOptionalNames.push(`Adicionais: ${oldStyleStr}`);
    }

    const newItem: CartItem = {
      product: selectedProduct,
      quantity: 1,
      selectedOptionals: allOptionals,
      groupedOptionalNames: groupedOptionalNames.length > 0 ? groupedOptionalNames : undefined,
      notes: itemNotes || undefined,
    };

    setCart(prev => [...prev, newItem]);
    setSelectedProduct(null);
    setSelectedOptionals([]);
    setSelectedGroupItems({});
    setItemNotes('');
  }

  function removeCartItem(index: number) {
    setCart(prev => prev.filter((_, i) => i !== index));
  }

  function updateCartQuantity(index: number, delta: number) {
    setCart(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
      ).filter(item => item.quantity > 0)
    );
  }

  function getCartQuantity(productId: string): number {
    return cart.filter(item => item.product.id === productId).reduce((s, i) => s + i.quantity, 0);
  }

  function canGoNext(): boolean {
    switch (step) {
      case 1: return cart.length > 0;
      case 2: return phoneDigits.length >= 10;
      case 3: {
        if (customerName === 'Cliente Loja') return true;
        const nameParts = customerName.trim().split(/\s+/);
        return nameParts.length >= 2 && nameParts.every(p => p.length >= 2);
      }
      case 4:
        if (!deliveryType) return false;
        if (deliveryType === 'entrega') {
          const hasAddress = !!(deliveryAddress.trim() && deliveryNumber.trim() && deliveryNeighborhood.trim() && deliveryReference.trim());
          const hasFee = useNeighborhoodDeliveryMode
            ? !!deliveryNeighborhood.trim()
            : !!selectedDeliveryFeeType;
          return hasAddress && hasFee;
        }
        return true;
      case 5: return !!paymentMethod;
      default: return false;
    }
  }

  const isClienteLoja = customerName === 'Cliente Loja';

  function goNext() {
    if (!canGoNext()) return;
    if (step === 3 && isClienteLoja) {
      // Cliente Loja = retirada, skip delivery step
      setStep(5);
      return;
    }
    // Retirada: ao clicar em "Pronto" na etapa 4, abre cobrança em vez de ir para etapa 5
    if (step === 4 && deliveryType === 'retirada') {
      setPickupChargeOpen(true);
      return;
    }
    if (step < 5) setStep((step + 1) as Step);
  }

  function goBack() {
    if (step === 5 && isClienteLoja) {
      setStep(3);
      return;
    }
    if (step > 1) setStep((step - 1) as Step);
  }

  async function handleSubmit(override?: { paymentMethodId: string; paymentName: string; finalTotal: number; discount: number }) {
    if (!override && !canGoNext()) return;
    setIsSubmitting(true);

    const selectedPM = override
      ? { id: override.paymentMethodId, name: override.paymentName }
      : activePaymentMethods.find(m => m.id === paymentMethod);
    const paymentName = selectedPM?.name || '';
    const effectiveTotal = override ? override.finalTotal : total;
    const deliveryTypeLabel = deliveryType === 'entrega' ? 'Entrega' : 'Retirada';
    const fullAddress = deliveryType === 'entrega'
      ? `${deliveryAddress}, ${deliveryNumber}${deliveryComplement ? ` - ${deliveryComplement}` : ''} - ${deliveryNeighborhood}${deliveryReference ? ` | Ref: ${deliveryReference}` : ''}`
      : '';

    const noteParts = ['[EXPRESS]', `Pagamento: ${paymentName}`, deliveryTypeLabel];
    const noteStr = noteParts.join(' | ');

    const LANCHERIA_I9_ID_ITEMS = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';
    const printDescriptionEnabledItems = company?.id === LANCHERIA_I9_ID_ITEMS;
    const orderItems: OrderItem[] = cart.map(item => {
      let optionalsStr = '';
      if (item.groupedOptionalNames && item.groupedOptionalNames.length > 0) {
        optionalsStr = ` (${item.groupedOptionalNames.join(' | ')})`;
      } else if (item.selectedOptionals.length > 0) {
        const optStrs = item.selectedOptionals.map(o => 
          o.price > 0 ? `${o.name} R$${o.price.toFixed(2)}` : o.name
        );
        optionalsStr = ` (Adicionais: ${optStrs.join(', ')})`;
      }
      const optPrice = item.selectedOptionals.reduce((s, o) => s + o.price, 0);

      // Anexa marcador [DESC] em notes para o auto_printer renderizar a descrição no recibo.
      // Aplicado APENAS para Lancheria da i9 + categoria com print_description ligado.
      let itemNotes: string | undefined = item.notes || undefined;
      if (printDescriptionEnabledItems && item.product.description) {
        const cat = categories.find((c) => c.name === item.product.category);
        if (cat?.printDescription) {
          const descMarker = `[DESC]${item.product.description}[/DESC]`;
          itemNotes = itemNotes ? `${itemNotes} | ${descMarker}` : descMarker;
        }
      }

      return {
        id: crypto.randomUUID(),
        productId: item.product.id,
        name: item.product.name + optionalsStr,
        quantity: item.quantity,
        price: item.product.price + optPrice,
        notes: itemNotes,
      };
    });

    const success = await addOrder({
      customerName: customerName.trim(),
      customerPhone: phoneDigits || undefined,
      deliveryAddress: fullAddress || undefined,
      notes: noteStr,
      items: orderItems,
      total: effectiveTotal,
      status: 'pending',
      origin: 'balcao',
    });

    if (success) {
      // Enfileira comanda de produção (mesmo padrão do Waiter)
      if (settings.autoPrintProductionTicket && company?.id) {
        try {
          const LANCHERIA_I9_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';
          const printDescriptionEnabled = company?.id === LANCHERIA_I9_ID;
          const productionItems = cart.flatMap(item => {
            // Build a clean list of additional names (without prices, without group prefix)
            const additionalNames: string[] = [];
            if (item.groupedOptionalNames && item.groupedOptionalNames.length > 0) {
              // groupedOptionalNames already comes formatted like "GroupName: a R$1.00, b R$2.00"
              // Strip group prefix and prices to get only item names
              for (const entry of item.groupedOptionalNames) {
                const afterColon = entry.includes(':') ? entry.split(':').slice(1).join(':') : entry;
                const items = afterColon.split(',').map(s => s.replace(/\s*R\$\s*[\d.,]+\s*$/i, '').trim()).filter(Boolean);
                additionalNames.push(...items);
              }
            } else if (item.selectedOptionals.length > 0) {
              additionalNames.push(...item.selectedOptionals.map(o => o.name));
            }
            const notesParts: string[] = [];
            if (additionalNames.length > 0) notesParts.push(`Adicionais: ${additionalNames.join(', ')}`);
            if (item.notes) notesParts.push(item.notes);

            // Conditional product description (Lancheria da i9 + category opt-in)
            let description: string | undefined;
            if (printDescriptionEnabled && item.product.description) {
              const cat = categories.find((c) => c.name === item.product.category);
              if (cat?.printDescription) {
                description = item.product.description;
              }
            }

            return [{
              productName: item.product.name,
              quantity: item.quantity,
              notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
              description,
            }];
          });

          const html = generateProductionTicketHTML({
            tabNumber: 0,
            customerName: customerName.trim(),
            items: productionItems,
            createdAt: new Date(),
            paperSize: settings.printerPaperSize,
            referenceLabel: 'PEDIDO EXPRESS',
            layout: settings.printLayout,
          });

          await supabase.from('print_queue').insert({
            company_id: company.id,
            html_content: html,
            label: `Express - ${customerName.trim()}`,
          });
        } catch (e) {
          console.error('Erro ao enfileirar comanda de produção:', e);
        }
      }

      toast.success('Pedido Express criado com sucesso!');
      resetForm();
      onOpenChange(false);
    }
    setIsSubmitting(false);
  }


  function resetForm() {
    setStep(1);
    setCustomerPhone('');
    setCustomerName('');
    setCustomerFound(false);
    setCart([]);
    setSelectedCategory(null);
    setSelectedProduct(null);
    setSelectedOptionals([]);
    setSelectedGroupItems({});
    setItemNotes('');
    setDeliveryType('');
    setDeliveryAddress('');
    setDeliveryNumber('');
    setDeliveryComplement('');
    setDeliveryNeighborhood('');
    setDeliveryReference('');
    setDeliveryFee(0);
    setSelectedDeliveryFeeType('');
    setPaymentMethod('');
  }

  const stepLabels = [
    { icon: Package, label: 'Produtos' },
    { icon: Phone, label: 'Telefone' },
    { icon: User, label: 'Nome' },
    { icon: MapPin, label: 'Entrega' },
    { icon: CreditCard, label: 'Pagamento' },
  ];

  // Check if product detail dialog should use wizard flow
  const useWizardFlow = settings.lateralScrollOptionals;
  const hasOptionalsOrGroups = selectedProduct && (
    selectedProductGroups.length > 0 ||
    (selectedProduct.optionals && selectedProduct.optionals.filter(o => o.active).length > 0)
  );

  return (
    <>
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

          <div className="flex-1 overflow-y-auto space-y-4 px-2 pb-6">
            {/* Step 1: Products — catalog-style browsing */}
            {step === 1 && (
              <div className="space-y-3">
                {productsLoading || groupsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Carregando...</span>
                  </div>
                ) : activeProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Nenhum produto cadastrado.</div>
                ) : (
                  <>
                    {/* Category tabs */}
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

                    {/* Product list — catalog card style */}
                    <div className="space-y-3">
                      {filteredProducts.map((product) => {
                        const quantity = getCartQuantity(product.id);
                        return (
                          <Card
                            key={product.id}
                            className={cn(
                              "cursor-pointer hover:border-green-400/50 transition-all overflow-hidden",
                              quantity > 0 && "border-green-500 bg-green-50 dark:bg-green-950/30"
                            )}
                            onClick={() => handleProductClick(product)}
                          >
                            <CardContent className="p-0">
                              <div className="flex h-full">
                                {product.imageUrl ? (
                                  <div className="w-28 min-h-[7rem] flex-shrink-0 overflow-hidden">
                                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                                  </div>
                                ) : (
                                  <div className="w-28 min-h-[7rem] flex-shrink-0 bg-muted flex items-center justify-center">
                                    <span className="text-3xl">🍽️</span>
                                  </div>
                                )}
                                <div className="flex-1 p-3 flex flex-col justify-between">
                                  <div>
                                    <h3 className="font-semibold text-foreground line-clamp-2 break-words">{product.name}</h3>
                                    {product.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{product.description}</p>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between mt-2">
                                    <p className="text-green-600 dark:text-green-400 font-bold">R$ {formatPrice(product.price)}</p>
                                    {quantity > 0 && (
                                      <Badge variant="secondary" className="text-xs">{quantity} no carrinho</Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Cart Summary */}
                {cart.length > 0 && (
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <ShoppingBag className="w-4 h-4 text-primary" />
                      <span className="font-semibold">Resumo ({cart.reduce((s, i) => s + i.quantity, 0)} itens)</span>
                    </div>
                    {cart.map((item, index) => {
                      const itemTotal = calculateItemTotal(item);
                      return (
                        <div key={index} className="text-sm">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <button onClick={(e) => { e.stopPropagation(); removeCartItem(index); }} className="text-muted-foreground hover:text-destructive">
                                <X className="w-3 h-3" />
                              </button>
                              <span>{item.quantity}x {item.product.name}</span>
                            </div>
                            <span className="text-muted-foreground">R$ {itemTotal.toFixed(2)}</span>
                          </div>
                          {item.groupedOptionalNames && item.groupedOptionalNames.length > 0 && (
                            <div className="ml-7 text-xs text-muted-foreground">
                              {item.groupedOptionalNames.map((n, i) => <span key={i}>{n}{i < item.groupedOptionalNames!.length - 1 ? ' · ' : ''}</span>)}
                            </div>
                          )}
                          {item.notes && (
                            <p className="ml-7 text-xs text-muted-foreground italic">Obs: {item.notes}</p>
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
                    className="h-14 text-lg focus-visible:ring-primary"
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
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setCustomerPhone('(99) 99999-9999');
                    setCustomerName('Cliente Loja');
                    setCustomerFound(true);
                    setDeliveryType('retirada');
                    setStep(5);
                  }}
                >
                  🏪 Sem telefone — usar "Cliente Loja"
                </Button>
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
                    className="h-14 text-lg focus-visible:ring-primary"
                    autoFocus
                    disabled={isClienteLoja}
                    readOnly={isClienteLoja}
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
                <RadioGroup value={deliveryType} onValueChange={(v) => {
                  setDeliveryType(v as 'entrega' | 'retirada');
                  if (v === 'retirada') {
                    setDeliveryFee(0);
                    setSelectedDeliveryFeeType('');
                  }
                }}>
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
                    {/* Address fields first (auto-filled for returning customers) */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_92px] sm:items-end">
                      <div className="min-w-0">
                        <Label className="block leading-snug whitespace-normal break-words font-bold">Logradouro (rua, avenida, travessa) *</Label>
                        <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Ex: Rua das Flores" className="focus-visible:ring-primary" />
                      </div>
                      <div className="min-w-0">
                        <Label className="block leading-snug whitespace-nowrap font-bold">Número *</Label>
                        <Input value={deliveryNumber} onChange={(e) => setDeliveryNumber(e.target.value)} placeholder="123" inputMode="numeric" className="focus-visible:ring-primary" />
                      </div>
                    </div>
                    <div>
                      <Label className="font-bold">Complemento</Label>
                      <Input value={deliveryComplement} onChange={(e) => setDeliveryComplement(e.target.value)} placeholder="Apto 01, Sala 02..." className="focus-visible:ring-primary" />
                    </div>
                    {(!useNeighborhoodDeliveryMode) && (
                      <div>
                        <Label className="font-bold">Bairro *</Label>
                        <Input value={deliveryNeighborhood} onChange={(e) => setDeliveryNeighborhood(e.target.value)} placeholder="Nome do bairro" className="focus-visible:ring-primary" />
                      </div>
                    )}
                    <div>
                      <Label className="font-bold">Ponto de referência *</Label>
                      <Input value={deliveryReference} onChange={(e) => setDeliveryReference(e.target.value)} placeholder="Próximo ao mercado, em frente à escola..." className="focus-visible:ring-primary" />
                    </div>

                    {/* Delivery fee selection below address */}
                    <div className="border-t border-border pt-3 mt-1">
                      {useNeighborhoodDeliveryMode ? (
                        <div>
                          <Label className="font-bold">Bairro / Taxa de entrega *</Label>
                          <Select
                            value={deliveryNeighborhood}
                            onValueChange={(val) => {
                              const found = activeNeighborhoods.find(n => n.neighborhoodName === val);
                              setDeliveryNeighborhood(val);
                              setDeliveryFee(found ? found.deliveryFee : 0);
                            }}
                          >
                            <SelectTrigger className="focus:ring-primary">
                              <SelectValue placeholder="Selecione o bairro" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeNeighborhoods.map(n => (
                                <SelectItem key={n.id} value={n.neighborhoodName}>
                                  {n.neighborhoodName} — R$ {n.deliveryFee.toFixed(2)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div>
                          <Label className="font-bold">Região de entrega *</Label>
                          <RadioGroup
                            value={selectedDeliveryFeeType}
                            onValueChange={(v) => {
                              const feeType = v as 'city' | 'interior';
                              setSelectedDeliveryFeeType(feeType);
                              setDeliveryFee(feeType === 'city' ? settings.deliveryFeeCity : settings.deliveryFeeInterior);
                            }}
                          >
                            <div className="grid grid-cols-2 gap-3">
                              <label className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                                selectedDeliveryFeeType === 'city' ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                              )}>
                                <RadioGroupItem value="city" />
                                <div>
                                  <span className="font-medium">Cidade</span>
                                  <p className="text-xs text-muted-foreground">R$ {settings.deliveryFeeCity.toFixed(2)}</p>
                                </div>
                              </label>
                              <label className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                                selectedDeliveryFeeType === 'interior' ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                              )}>
                                <RadioGroupItem value="interior" />
                                <div>
                                  <span className="font-medium">Interior</span>
                                  <p className="text-xs text-muted-foreground">R$ {settings.deliveryFeeInterior.toFixed(2)}</p>
                                </div>
                              </label>
                            </div>
                          </RadioGroup>
                        </div>
                      )}

                      {deliveryFee > 0 && (
                        <div className="bg-primary/5 rounded-lg p-3 flex justify-between items-center mt-3">
                          <span className="text-sm font-medium">Taxa de entrega:</span>
                          <span className="text-sm font-bold text-primary">R$ {deliveryFee.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Payment + Resumo Final */}
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
                      {activePaymentMethods
                        .filter(pm => !isClienteLoja || (pm.integration_type !== 'tef_pinpad' && pm.integration_type !== 'tef_smartpos'))
                        .map(pm => (
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
                {isClienteLoja && (
                  <p className="text-xs text-muted-foreground">
                    🏪 "Cliente Loja" não permite pagamento via TEF.
                  </p>
                )}

                {/* Documento fiscal — apenas para Retirada */}
                {deliveryType === 'retirada' && (
                  <PDVV2DocumentModeSelector
                    companyId={company?.id}
                    value={documentMode}
                    onChange={setDocumentMode}
                  />
                )}

                {/* Resumo Final */}
                {cart.length > 0 && (
                  <div className="bg-muted rounded-lg p-4 space-y-3 mt-4 max-h-[50vh] overflow-y-auto">
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingBag className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-base">Resumo do Pedido</span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm"><strong>Cliente:</strong> {customerName}</p>
                      <p className="text-sm"><strong>Telefone:</strong> {customerPhone}</p>
                      <p className="text-sm"><strong>Tipo:</strong> {deliveryType === 'entrega' ? 'Entrega' : 'Retirada'}</p>
                      {deliveryType === 'entrega' && (
                        <p className="text-sm"><strong>Endereço:</strong> {deliveryAddress}, {deliveryNumber}{deliveryComplement ? ` - ${deliveryComplement}` : ''} - {deliveryNeighborhood}{deliveryReference ? ` (Ref: ${deliveryReference})` : ''}</p>
                      )}
                    </div>

                    <div className="border-t border-border pt-3 space-y-3">
                      <p className="text-sm font-semibold">Produtos:</p>
                      {cart.map((item, index) => {
                        const itemTotal = calculateItemTotal(item);
                        return (
                          <div key={index} className="flex gap-3 bg-background rounded-lg p-2 border border-border">
                            {item.product.imageUrl ? (
                              <img src={item.product.imageUrl} alt={item.product.name} className="w-14 h-14 rounded-md object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                <Package className="w-6 h-6 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start">
                                <p className="text-sm font-medium">{item.quantity}x {item.product.name}</p>
                                <p className="text-sm font-semibold text-green-600 dark:text-green-400 whitespace-nowrap ml-2">R$ {itemTotal.toFixed(2)}</p>
                              </div>
                              {item.groupedOptionalNames && item.groupedOptionalNames.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                  {item.groupedOptionalNames.map((n, i) => (
                                    <p key={i} className="text-xs text-muted-foreground">{n}</p>
                                  ))}
                                </div>
                              )}
                              {item.notes && (
                                <p className="text-xs text-muted-foreground italic mt-1">Obs: {item.notes}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-border pt-3 space-y-1">
                      {(() => {
                        const selectedPM = activePaymentMethods.find(m => m.id === paymentMethod);
                        return (
                          <>
                            <p className="text-sm"><strong>Pagamento:</strong> {selectedPM?.name || '—'}</p>
                            {selectedPM?.name?.toLowerCase().includes('pix') && selectedPM.pix_key && (
                              <p className="text-xs text-muted-foreground">Chave PIX: {selectedPM.pix_key}</p>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="border-t border-border pt-2 mt-2 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Subtotal</span>
                        <span>R$ {subtotal.toFixed(2)}</span>
                      </div>
                      {deliveryType === 'entrega' && deliveryFee > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>Taxa de entrega</span>
                          <span>R$ {deliveryFee.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg pt-1">
                        <span>Total</span>
                        <span className="text-primary">R$ {total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3 pt-4 pb-4 border-t border-border mt-4">
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
                {step === 4 && deliveryType === 'retirada' ? (
                  <>Pronto <ArrowRight className="w-4 h-4" /></>
                ) : (
                  <>Avançar <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            ) : (
              <Button className="flex-1 gap-2" onClick={() => handleSubmit()} disabled={!canGoNext() || isSubmitting}>
                {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : '✅ Confirmar Pedido'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Detail Dialog — identical to the online catalog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => { if (!open) { setSelectedProduct(null); setSelectedOptionals([]); setSelectedGroupItems({}); setItemNotes(''); } }}>
        <DialogContent className="max-h-[85dvh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="px-6 pt-6 pb-3 border-b flex-shrink-0">
            <DialogTitle className="pr-6">{selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {selectedProduct && (
              useWizardFlow && hasOptionalsOrGroups ? (
                <LateralOptionalsWizard
                  product={selectedProduct}
                  groups={selectedProductGroups}
                  oldStyleOptionals={selectedProduct.optionals?.filter(o => o.active) || []}
                  selectedOptionals={selectedOptionals}
                  selectedGroupItems={selectedGroupItems}
                  itemNotes={itemNotes}
                  onToggleOptional={toggleOptional}
                  onToggleGroupItem={toggleGroupItem}
                  onNotesChange={setItemNotes}
                  onAddToCart={addToCart}
                />
              ) : (
                <div className="space-y-4">
                  {selectedProduct.imageUrl && (
                    <div className="w-full h-48 rounded-lg overflow-hidden">
                      <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  {selectedProduct.description && (
                    <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>
                  )}
                  <p className="text-2xl font-bold text-green-600">
                    R$ {formatPrice(selectedProduct.price)}
                  </p>

                  {/* Old-style optionals */}
                  {selectedProduct.optionals && selectedProduct.optionals.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Adicionais</Label>
                      {selectedProduct.optionals.filter(o => o.active).map((optional) => (
                        <div
                          key={optional.id}
                          className={cn(
                            "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors",
                            selectedOptionals.some(o => o.id === optional.id)
                              ? "border-primary bg-primary/5"
                              : "hover:border-primary/50"
                          )}
                          onClick={() => toggleOptional(optional)}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox checked={selectedOptionals.some(o => o.id === optional.id)} onCheckedChange={() => toggleOptional(optional)} />
                            <span className="font-medium">{optional.name}</span>
                          </div>
                          {optional.price > 0 && (
                            <span className="text-green-600 font-semibold">+R$ {formatPrice(optional.price)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Optional Groups — identical to Menu.tsx */}
                  {selectedProductGroups.length > 0 && (
                    <div className="space-y-4">
                      {selectedProductGroups.map(group => (
                        <div key={group.id} className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Label className="text-base font-semibold">{group.name}</Label>
                            <Badge variant="outline" className="text-xs">
                              {group.minSelect > 0 ? `mín ${group.minSelect} / ` : ''}
                              máx {group.maxSelect > 0 ? group.maxSelect : 1}
                            </Badge>
                            {group.minSelect > 0 && (
                              <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
                            )}
                          </div>

                          {group.layout === 'horizontal' ? (
                            <div className="grid grid-cols-3 gap-2">
                              {group.items.filter(i => i.active).map(item => {
                                const isSelected = selectedGroupItems[group.id]?.has(item.id) || false;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className={cn(
                                      "relative rounded-xl border-2 overflow-hidden transition-all text-left",
                                      isSelected ? "border-primary ring-2 ring-primary/30 shadow-md" : "border-border hover:border-primary/50"
                                    )}
                                    onClick={() => toggleGroupItem(group.id, item.id, group.maxSelect)}
                                  >
                                    {item.imageUrl ? (
                                      <div className="w-full aspect-square overflow-hidden">
                                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                      </div>
                                    ) : (
                                      <div className="w-full aspect-square bg-muted flex items-center justify-center">
                                        <span className="text-3xl">🍽️</span>
                                      </div>
                                    )}
                                    <div className="p-1.5 space-y-0.5">
                                      <p className={cn("text-[11px] font-semibold line-clamp-2 leading-tight text-center", isSelected ? "text-primary" : "text-foreground")}>
                                        {item.name}
                                      </p>
                                      {item.price > 0 && (
                                        <p className="text-[10px] text-green-600 font-medium text-center">+R$ {formatPrice(item.price)}</p>
                                      )}
                                    </div>
                                    {isSelected && (
                                      <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                        <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            group.items.filter(i => i.active).map(item => {
                              const isSelected = selectedGroupItems[group.id]?.has(item.id) || false;
                              return (
                                <div
                                  key={item.id}
                                  className={cn(
                                    "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors",
                                    isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50"
                                  )}
                                  onClick={() => toggleGroupItem(group.id, item.id, group.maxSelect)}
                                >
                                  <div className="flex items-center gap-3">
                                    <Checkbox checked={isSelected} onCheckedChange={() => toggleGroupItem(group.id, item.id, group.maxSelect)} />
                                    {item.imageUrl && (
                                      <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                                    )}
                                    <span className="font-medium">{item.name}</span>
                                  </div>
                                  {item.price > 0 && (
                                    <span className="text-green-600 font-semibold">+R$ {formatPrice(item.price)}</span>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <Label>Observações (opcional)</Label>
                    <Input
                      value={itemNotes}
                      onChange={(e) => setItemNotes(e.target.value)}
                      placeholder="Ex: Sem cebola, bem passado..."
                      className="mt-2"
                    />
                  </div>
                </div>
              )
            )}
          </div>
          {/* Add to cart button — only for non-wizard flow */}
          {selectedProduct && !(useWizardFlow && hasOptionalsOrGroups) && (
            <div className="px-6 py-4 border-t flex-shrink-0 bg-background">
              <Button onClick={addToCart} className="w-full" size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar ao carrinho
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cobrança da Retirada — abre após o lojista clicar em "Pronto" na etapa 4 */}
      <PDVV2PaymentDialog
        open={pickupChargeOpen}
        onOpenChange={(o) => {
          if (!o && !isSubmitting) setPickupChargeOpen(false);
        }}
        companyId={company?.id}
        total={total}
        title="Cobrar Retirada"
        channel="express"
        cashOnly={isClienteLoja}
        showDocumentMode
        onConfirm={async ({ paymentMethodId, paymentName, finalTotal, discount }) => {
          await handleSubmit({ paymentMethodId, paymentName, finalTotal, discount });
          setPickupChargeOpen(false);
        }}
      />
    </>
  );
}
