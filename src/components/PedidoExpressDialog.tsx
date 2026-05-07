import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
import { useCashRegister } from '@/hooks/useCashRegister';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthContext } from '@/contexts/AuthContext';
import { useOrderContext } from '@/contexts/OrderContext';
import { OrderItem } from '@/types/order';
import { Product, ProductOptional, CartItem } from '@/types/product';
import { LateralOptionalsWizard } from '@/components/menu/LateralOptionalsWizard';
import { supabase } from '@/integrations/supabase/client';
import { generateProductionTicketHTML } from '@/utils/printProductionTicket';
import { computeReadyOffsetMinutes } from '@/utils/estimatedReadyOffset';
import { printOnlyReceipt } from '@/utils/pdvV2Print';
import { PDVV2DocumentModeSelector, DocumentMode } from '@/components/pdv-v2/PDVV2DocumentModeSelector';
import { PDVV2PaymentDialog } from '@/components/pdv-v2/PDVV2PaymentDialog';
import { PDVV2CategoryBrowser } from '@/components/pdv-v2/PDVV2CategoryBrowser';
import { PDVV2NFCePostSaleDialog } from '@/components/pdv-v2/PDVV2NFCePostSaleDialog';
import { runTefPayment, TefOptions } from '@/utils/pdvV2Tef';
import { emitirNFCe, NFCeItem, NFCeTefData, NFCeRecord } from '@/services/nfceService';
import {
  sendPinpadPayment,
  pollPinpadStatus,
  confirmPinpadTransaction,
  cancelPinpadTransaction,
} from '@/services/pinpadService';
import {
  sendPaymentToMultiplusCard,
  checkMultiplusCardTransactionStatus,
  abortMultiplusCardSale,
} from '@/services/multiplusCardService';
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
  const { activePaymentMethods: expressPaymentMethods, loading: paymentLoading } = usePaymentMethods({ companyId: company?.id, channel: 'express' });
  // Fallback: para a Lancheria da I9, lista TODAS as formas ativas da empresa
  // (independente de canal) para garantir TEF e demais métodos no Pedido Express.
  const { activePaymentMethods: allActivePaymentMethods } = usePaymentMethods({ companyId: company?.id });
  const { settings } = useStoreSettings({ companyId: company?.id });
  const { getActiveNeighborhoods } = useDeliveryNeighborhoods({ companyId: company?.id });
  const { taxRules } = useTaxRules({ companyId: company?.id });
  const { currentRegister, addSale } = useCashRegister({ companyId: company?.id });
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });
  const fiscalEnabled = isModuleEnabled('fiscal');
  const activeNeighborhoods = getActiveNeighborhoods();
  const useNeighborhoodDeliveryMode = settings.deliveryMode === 'neighborhood' && activeNeighborhoods.length > 0;

  const [step, setStep] = useState<Step>(1);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerFound, setCustomerFound] = useState(false);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  // Lancheria da I9 — atalho otimizado: pula Telefone/Nome/Entrega ao usar "Cliente Loja"
  
  const isLancheriaI9 = true;

  // Para a Lancheria I9: usa TODAS as formas ativas (deduplicadas por nome+integração).
  // Demais lojas mantêm apenas as do canal Express.
  const activePaymentMethods = useMemo(() => {
    if (!isLancheriaI9) return expressPaymentMethods;
    const seen = new Set<string>();
    const merged = [...expressPaymentMethods, ...allActivePaymentMethods].filter((pm: any) => {
      const key = `${(pm.name || '').toLowerCase().trim()}|${pm.integration_type || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return merged;
  }, [isLancheriaI9, expressPaymentMethods, allActivePaymentMethods]);

  // Cart uses the same CartItem type as the online catalog
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);

  // Product detail dialog state — mirrors Menu.tsx exactly
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOptionals, setSelectedOptionals] = useState<ProductOptional[]>([]);
  const [selectedGroupItems, setSelectedGroupItems] = useState<Record<string, Map<string, number>>>({});
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

  // ===== Persistência do rascunho (sobrevive a troca de aba / refresh) =====
  const draftKey = company?.id ? `expressDraft_${company.id}` : null;
  const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
  const draftHydratedRef = useRef(false);
  const draftRestoreNotifiedRef = useRef(false);

  // Hidrata uma única vez quando produtos/empresa estiverem prontos
  useEffect(() => {
    if (draftHydratedRef.current) return;
    if (!draftKey || productsLoading) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) { draftHydratedRef.current = true; return; }
      const parsed = JSON.parse(raw);
      if (!parsed?.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(draftKey);
        draftHydratedRef.current = true;
        return;
      }
      // Revalida itens contra produtos ativos atuais
      if (Array.isArray(parsed.cart) && parsed.cart.length > 0) {
        const currentActive = getActiveProducts();
        const validCart: CartItem[] = parsed.cart
          .map((it: any) => {
            const fresh = currentActive.find(p => p.id === it?.product?.id);
            if (!fresh) return null;
            return {
              product: fresh,
              quantity: Math.max(1, Number(it.quantity) || 1),
              selectedOptionals: Array.isArray(it.selectedOptionals) ? it.selectedOptionals : [],
              groupedOptionalNames: it.groupedOptionalNames,
              notes: it.notes,
            } as CartItem;
          })
          .filter(Boolean) as CartItem[];
        if (validCart.length > 0) setCart(validCart);
      }
      if (typeof parsed.step === 'number') setStep(parsed.step as Step);
      if (typeof parsed.customerPhone === 'string') setCustomerPhone(parsed.customerPhone);
      if (typeof parsed.customerName === 'string') setCustomerName(parsed.customerName);
      if (parsed.deliveryType === 'entrega' || parsed.deliveryType === 'retirada') setDeliveryType(parsed.deliveryType);
      if (typeof parsed.deliveryAddress === 'string') setDeliveryAddress(parsed.deliveryAddress);
      if (typeof parsed.deliveryNumber === 'string') setDeliveryNumber(parsed.deliveryNumber);
      if (typeof parsed.deliveryComplement === 'string') setDeliveryComplement(parsed.deliveryComplement);
      if (typeof parsed.deliveryNeighborhood === 'string') setDeliveryNeighborhood(parsed.deliveryNeighborhood);
      if (typeof parsed.deliveryReference === 'string') setDeliveryReference(parsed.deliveryReference);
      if (typeof parsed.deliveryFee === 'number') setDeliveryFee(parsed.deliveryFee);
      if (parsed.selectedDeliveryFeeType === 'city' || parsed.selectedDeliveryFeeType === 'interior') {
        setSelectedDeliveryFeeType(parsed.selectedDeliveryFeeType);
      }
      if (typeof parsed.paymentMethod === 'string') setPaymentMethod(parsed.paymentMethod);
      if (typeof parsed.selectedCategory === 'string') setSelectedCategory(parsed.selectedCategory);
      if (typeof parsed.contentScrollTop === 'number') pendingScrollTopRef.current = parsed.contentScrollTop;
      // Restaura produto selecionado (modal de adicionais aberto) com seleções
      if (parsed.selectedProductId && typeof parsed.selectedProductId === 'string') {
        const freshProduct = getActiveProducts().find(p => p.id === parsed.selectedProductId);
        if (freshProduct) {
          setSelectedProduct(freshProduct);
          if (Array.isArray(parsed.selectedOptionals)) {
            setSelectedOptionals(parsed.selectedOptionals);
          }
          if (parsed.selectedGroupItems && typeof parsed.selectedGroupItems === 'object') {
            const restored: Record<string, Map<string, number>> = {};
            for (const [gid, ids] of Object.entries(parsed.selectedGroupItems)) {
              if (Array.isArray(ids)) {
                const m = new Map<string, number>();
                (ids as any[]).forEach(entry => {
                  if (typeof entry === 'string') m.set(entry, 1);
                  else if (Array.isArray(entry) && entry.length === 2) m.set(entry[0], entry[1]);
                });
                restored[gid] = m;
              }
            }
            setSelectedGroupItems(restored);
          }
          if (typeof parsed.itemNotes === 'string') setItemNotes(parsed.itemNotes);
        }
      }
      const hadCart = Array.isArray(parsed.cart) && parsed.cart.length > 0;
      const hadOpenProduct = !!parsed.selectedProductId;
      // Reabre o diálogo automaticamente se havia um rascunho ativo
      if (!open && (hadCart || hadOpenProduct)) {
        onOpenChange(true);
      }
      if ((hadCart || hadOpenProduct) && !draftRestoreNotifiedRef.current) {
        toast.success('Seu pedido foi restaurado');
        draftRestoreNotifiedRef.current = true;
      }
    } catch (e) {
      console.warn('[ExpressDraft] falha ao restaurar', e);
    } finally {
      draftHydratedRef.current = true;
    }
  }, [draftKey, productsLoading, getActiveProducts, open, onOpenChange]);

  // Persiste o rascunho a cada mudança relevante (após hidratação)
  useEffect(() => {
    if (!draftKey || !draftHydratedRef.current) return;
    const hasContent =
      cart.length > 0 ||
      !!selectedProduct ||
      selectedOptionals.length > 0 ||
      Object.keys(selectedGroupItems).length > 0 ||
      itemNotes.length > 0 ||
      customerPhone.length > 0 ||
      customerName.length > 0 ||
      deliveryAddress.length > 0;
    if (!hasContent && step === 1) {
      localStorage.removeItem(draftKey);
      return;
    }
    try {
      const payload = {
        savedAt: Date.now(),
        step,
        cart: cart.map(item => ({
          product: { id: item.product.id },
          quantity: item.quantity,
          selectedOptionals: item.selectedOptionals,
          groupedOptionalNames: item.groupedOptionalNames,
          notes: item.notes,
        })),
        customerPhone,
        customerName,
        deliveryType,
        deliveryAddress,
        deliveryNumber,
        deliveryComplement,
        deliveryNeighborhood,
        deliveryReference,
        deliveryFee,
        selectedDeliveryFeeType,
        paymentMethod,
        selectedCategory,
        contentScrollTop: contentScrollRef.current?.scrollTop ?? 0,
        selectedProductId: selectedProduct?.id ?? null,
        selectedOptionals,
        selectedGroupItems: Object.fromEntries(
          Object.entries(selectedGroupItems).map(([k, v]) => [k, Array.from(v.entries())])
        ),
        itemNotes,
      };
      localStorage.setItem(draftKey, JSON.stringify(payload));
    } catch (e) {
      console.warn('[ExpressDraft] falha ao salvar', e);
    }
  }, [
    draftKey, step, cart, customerPhone, customerName,
    deliveryType, deliveryAddress, deliveryNumber, deliveryComplement,
    deliveryNeighborhood, deliveryReference, deliveryFee,
    selectedDeliveryFeeType, paymentMethod, selectedCategory,
    selectedProduct, selectedOptionals, selectedGroupItems, itemNotes,
  ]);

  // Cobrança via PDVV2PaymentDialog (apenas Retirada)
  const [pickupChargeOpen, setPickupChargeOpen] = useState(false);

  // Pop-up pós-venda da NFC-e (mesmo padrão do PDVV2)
  const [nfceRecord, setNfceRecord] = useState<NFCeRecord | null>(null);
  const [nfceDialogOpen, setNfceDialogOpen] = useState(false);
  const [nfceAutoPrint, setNfceAutoPrint] = useState(false);

  // ===== TEF state (mini seletor inline) =====
  const [tefCardType, setTefCardType] = useState<'credit' | 'debit' | 'pix'>('credit');
  const [tefInstallmentMode, setTefInstallmentMode] = useState<'avista' | 'loja' | 'adm'>('avista');
  const [tefInstallments, setTefInstallments] = useState('2');
  const [tefProcessing, setTefProcessing] = useState(false);
  const [tefStatus, setTefStatus] = useState('');
  const tefCancelRef = useRef(false);

  const activeProducts = getActiveProducts();
  const productCategories = getCategories();

  const currentCategory = selectedCategory && productCategories.includes(selectedCategory)
    ? selectedCategory
    : productCategories[0] || null;

  useEffect(() => {
    if (!open || step !== 1 || pendingScrollTopRef.current === null) return;
    const node = contentScrollRef.current;
    if (!node) return;
    const scrollTop = pendingScrollTopRef.current;
    requestAnimationFrame(() => {
      node.scrollTop = scrollTop;
      pendingScrollTopRef.current = null;
    });
  }, [open, step, currentCategory, productsLoading, groupsLoading]);

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
        if (g.waiterOnly) return false;
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
      const current = new Map(prev[groupId] || []);
      const currentQty = current.get(itemId) || 0;
      if (currentQty > 0) {
        current.delete(itemId);
      } else {
        let totalSel = 0;
        current.forEach(q => { totalSel += q; });
        if (effectiveMax === 1) {
          current.clear();
          current.set(itemId, 1);
        } else if (totalSel >= effectiveMax) {
          toast.error(`Máximo ${effectiveMax} seleções neste grupo`);
          return prev;
        } else {
          current.set(itemId, 1);
        }
      }
      return { ...prev, [groupId]: current };
    });
  }

  function changeGroupItemQty(groupId: string, itemId: string, delta: number, maxSelect: number, maxPerItem: number) {
    const maxGroup = maxSelect > 0 ? maxSelect : Infinity;
    setSelectedGroupItems(prev => {
      const cur = new Map(prev[groupId] || []);
      const currentQty = cur.get(itemId) || 0;
      const newQty = currentQty + delta;
      if (newQty <= 0) {
        cur.delete(itemId);
      } else if (newQty > maxPerItem) {
        toast.error(`Máximo ${maxPerItem} por item`);
        return prev;
      } else {
        let prevTotal = 0;
        (prev[groupId] || new Map()).forEach(q => { prevTotal += q; });
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

  // addToCart — same logic as Menu.tsx, creates a catalog CartItem
  function addToCart() {
    if (!selectedProduct) return;

    // Validate min selections
    for (const group of selectedProductGroups) {
      const selected = selectedGroupItems[group.id];
      let count = 0;
      if (selected) selected.forEach(q => { count += q; });
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
      const pickedItems: { name: string; price: number }[] = [];
      for (const item of group.items) {
        const qty = selected.get(item.id) || 0;
        if (qty > 0) {
          for (let i = 0; i < qty; i++) {
            groupOptionals.push({
              id: item.id,
              productId: selectedProduct.id,
              name: item.name,
              price: item.price,
              type: 'extra',
              active: true,
            });
          }
          pickedItems.push({ name: qty > 1 ? `${qty}x ${item.name}` : item.name, price: item.price * qty });
        }
      }
      if (pickedItems.length > 0) {
        const itemsStr = pickedItems.map(i => i.price > 0 ? `${i.name} R$${i.price.toFixed(2)}` : i.name).join(', ');
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
      case 5: return isLancheriaI9 ? true : !!paymentMethod;
      default: return false;
    }
  }

  const isClienteLoja = customerName === 'Cliente Loja';

  // Cliente Loja: aceita apenas Dinheiro ou PIX (não pode TEF/Máquina/Crédito/Débito)
  const visiblePaymentMethods = isClienteLoja
    ? activePaymentMethods.filter((pm: any) => {
        const integ = pm?.integration_type;
        if (integ === 'tef_pinpad' || integ === 'tef_smartpos') return false;
        return /dinheiro|pix/i.test(pm.name);
      })
    : activePaymentMethods;

  // Se a forma selecionada não estiver mais visível (ex.: trocou para Cliente Loja após escolher TEF), limpa
  useEffect(() => {
    if (paymentMethod && !visiblePaymentMethods.some(m => m.id === paymentMethod)) {
      setPaymentMethod('');
    }
  }, [paymentMethod, visiblePaymentMethods]);

  function goNext() {
    if (!canGoNext()) return;
    if (step === 3 && isClienteLoja) {
      // Cliente Loja = retirada, skip delivery step
      setStep(5);
      return;
    }
    // Retirada: no fluxo padrão, ao clicar em "Pronto" na etapa 4 abre cobrança.
    // Lancheria I9 mantém a etapa 5 com os botões "Enviar para Cozinha" / "Finalizar Pedido".
    if (step === 4 && deliveryType === 'retirada') {
      if (isLancheriaI9) {
        setStep(5);
        return;
      }
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

  async function handleSubmit(override?: {
    paymentMethodId: string;
    paymentName: string;
    finalTotal: number;
    discount: number;
    /** I9 — "Finalizar Pedido": cria já como entregue e imprime apenas recibo (sem comanda de produção). */
    finalizeNow?: boolean;
    /** Documento fiscal escolhido no pop-up de cobrança (I9). */
    documentMode?: DocumentMode;
    /** TEF executado pelo PDVV2PaymentDialog (mesma regra do PDV V2). */
    tefOptions?: TefOptions;
    tefIntegration?: 'tef_pinpad' | 'tef_smartpos';
    /** CPF/CNPJ do destinatário da NFC-e (apenas dígitos). */
    customerDocument?: string;
    /** I9: usuário escolheu imprimir o documento gerado neste pop-up */
    printDocument?: boolean;
    /** TEF já cobrado pelo PaymentDialog (não disparar de novo). */
    prechargedTef?: {
      tefData?: NFCeTefData;
      notesFragment?: string;
    };
  }) {
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

    // ===== TEF: dispara gerenciador ANTES de criar o pedido =====
    // Só ocorre no fluxo direto da etapa 5 (sem override do PDVV2PaymentDialog).
    const integType = (selectedPM as any)?.integration_type as string | undefined;
    const isTefPayment = !override && (integType === 'tef_pinpad' || integType === 'tef_smartpos') && !!company?.id;
    let tefNote = '';

    if (isTefPayment) {
      const tefPaymentType: 'credit' | 'debit' | 'pix' = tefCardType;
      const installmentCount = tefCardType === 'debit' || tefCardType === 'pix'
        ? 1
        : tefInstallmentMode !== 'avista'
          ? Math.max(2, parseInt(tefInstallments) || 2)
          : 1;
      const tefInstallmentType: 'loja' | 'adm' = tefInstallmentMode === 'loja' ? 'loja' : 'adm';

      tefCancelRef.current = false;
      setTefProcessing(true);

      try {
        if (integType === 'tef_pinpad') {
          // ===== PinPad WebService Flow (CRT → polling → CNF) =====
          setTefStatus('Enviando para PinPad...');
          const createResult = await sendPinpadPayment(company!.id, {
            amount: effectiveTotal,
            paymentType: tefPaymentType,
            installments: installmentCount,
            installmentType: tefInstallmentType,
          });

          if (!createResult.success || !createResult.hash) {
            toast.error(`Erro TEF PinPad: ${createResult.errorMessage || 'Falha ao iniciar transação'}`);
            setTefProcessing(false);
            setTefStatus('');
            setIsSubmitting(false);
            return;
          }

          const crtIdentificacao = createResult.identificacao || '';
          setTefStatus('Aguardando pagamento no PinPad...');
          let tefCompleted = false;

          for (let i = 0; i < 120 && !tefCompleted; i++) {
            if (tefCancelRef.current) {
              toast.info('Operação TEF cancelada pelo operador.');
              setTefProcessing(false);
              setTefStatus('');
              setIsSubmitting(false);
              return;
            }
            await new Promise((r) => setTimeout(r, 1000));
            const statusResult = await pollPinpadStatus(company!.id, createResult.hash);

            if (statusResult.status === 'processing') {
              setTefStatus('Processando pagamento no PinPad...');
            } else if (statusResult.status === 'approved' && statusResult.success) {
              tefCompleted = true;
              setTefStatus('Pagamento aprovado!');
              toast.success(`TEF aprovado! NSU: ${statusResult.nsu}`);

              await confirmPinpadTransaction(company!.id, {
                identificacao: crtIdentificacao,
                rede: statusResult.acquirer,
                nsu: statusResult.nsu,
                finalizacao: statusResult.finalizacao,
              });

              const installLabel = tefPaymentType === 'debit'
                ? ' | Débito'
                : tefPaymentType === 'pix'
                  ? ' | Pix'
                  : installmentCount > 1
                    ? ` | ${installmentCount}x Cartão ${tefInstallmentType === 'loja' ? 'LOJA' : 'ADM'}`
                    : ' | Crédito à Vista';
              const receiptData = statusResult.receiptLines && statusResult.receiptLines.length > 0
                ? ` | [COMPROVANTE]${statusResult.receiptLines.join('\\n')}[/COMPROVANTE]`
                : '';
              // 023-000 da venda original — persistido para reuso no CNC (estorno).
              const ctrlTag = statusResult.controlNumber ? ` | [TEF023]${statusResult.controlNumber}[/TEF023]` : '';
              tefNote = `TEF PinPad: NSU ${statusResult.nsu} | Aut ${statusResult.authorizationCode || '-'} | ${statusResult.cardBrand || '-'} | ${statusResult.acquirer || '-'}${installLabel}${receiptData}${ctrlTag}`;
            } else if (['declined', 'cancelled', 'error'].includes(statusResult.status)) {
              tefCompleted = true;
              toast.error(`TEF: ${statusResult.errorMessage || statusResult.operatorMessage || 'Pagamento não aprovado'}`);
              setTefProcessing(false);
              setTefStatus('');
              setIsSubmitting(false);
              return;
            }
          }

          if (!tefCompleted) {
            toast.warning('Timeout aguardando resposta do PinPad.');
            setTefProcessing(false);
            setTefStatus('');
            setIsSubmitting(false);
            return;
          }
        } else {
          // ===== SmartPOS (PINPDV) Flow =====
          const tefIdentifier = `express-${Date.now()}`;
          setTefStatus('Enviando para maquininha...');
          const createResult = await sendPaymentToMultiplusCard(company!.id, {
            amount: effectiveTotal,
            paymentType: tefPaymentType === 'pix' ? 'credit' : tefPaymentType,
            installments: installmentCount,
            identifier: tefIdentifier,
            description: customerName ? `Express - ${customerName}` : 'Pedido Express',
          });

          if (!createResult.success) {
            toast.error(`Erro TEF: ${createResult.errorMessage || 'Falha ao iniciar transação'}`);
            setTefProcessing(false);
            setTefStatus('');
            setIsSubmitting(false);
            return;
          }

          setTefStatus('Aguardando pagamento na maquininha...');
          let tefCompleted = false;
          for (let i = 0; i < 60 && !tefCompleted; i++) {
            if (tefCancelRef.current) {
              await abortMultiplusCardSale(company!.id, tefIdentifier).catch(() => {});
              toast.info('Operação TEF cancelada pelo operador.');
              setTefProcessing(false);
              setTefStatus('');
              setIsSubmitting(false);
              return;
            }
            await new Promise((r) => setTimeout(r, 2000));
            const status = await checkMultiplusCardTransactionStatus(company!.id, tefIdentifier);
            if (status.status === 'approved') {
              tefCompleted = true;
              toast.success(`TEF aprovado! NSU: ${status.nsu}`);
              tefNote = `TEF SmartPOS: NSU ${status.nsu || '-'} | Aut ${status.authorizationCode || '-'} | ${status.cardBrand || '-'} | ${status.acquirer || '-'}`;
            } else if (['declined', 'cancelled', 'error'].includes(status.status)) {
              tefCompleted = true;
              toast.error(`TEF: ${status.errorMessage || 'Pagamento não aprovado'}`);
              setTefProcessing(false);
              setTefStatus('');
              setIsSubmitting(false);
              return;
            }
          }
          if (!tefCompleted) {
            toast.warning('Timeout aguardando resposta da maquininha.');
            setTefProcessing(false);
            setTefStatus('');
            setIsSubmitting(false);
            return;
          }
        }
      } catch (e: any) {
        console.error('[Express] TEF error:', e);
        toast.error(`Erro TEF: ${e?.message || 'Erro desconhecido'}`);
        setTefProcessing(false);
        setTefStatus('');
        setIsSubmitting(false);
        return;
      }

      setTefProcessing(false);
      setTefStatus('');
    }

    // ===== TEF a partir do PDVV2PaymentDialog (I9 "Finalizar Pedido") =====
    // Mesmo padrão do PDV V2: executa runTefPayment ANTES de criar o pedido.
    let overrideTefData: NFCeTefData | undefined;
    let overrideTefNote = '';
    // Caso 1: TEF já foi cobrado pelo PaymentDialog (chargeTefBeforePopups) →
    // só reaproveita o resultado, sem disparar nova cobrança.
    if (override?.prechargedTef) {
      overrideTefData = override.prechargedTef.tefData;
      overrideTefNote = override.prechargedTef.notesFragment
        ? ` | ${override.prechargedTef.notesFragment}`
        : '';
    } else if (override?.tefIntegration && override?.tefOptions && company?.id) {
      const result = await runTefPayment({
        companyId: company.id,
        integration: override.tefIntegration,
        amount: override.finalTotal,
        options: override.tefOptions,
        description: customerName ? `Express - ${customerName}` : 'Pedido Express',
      });
      if (!result.success) {
        // toast já exibido pelo helper
        setIsSubmitting(false);
        return;
      }
      overrideTefData = result.tefData;
      overrideTefNote = result.notesFragment ? ` | ${result.notesFragment}` : '';
    }

    const noteParts = ['[EXPRESS]', `Pagamento: ${paymentName}`, deliveryTypeLabel];
    if (tefNote) noteParts.push(tefNote);
    if (overrideTefNote) noteParts.push(overrideTefNote.replace(/^ \| /, ''));
    const noteStr = noteParts.join(' | ');

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

      // A descrição do produto NÃO entra no notes do pedido — ela sai
      // exclusivamente na comanda de produção (campo `description` abaixo).
      const itemNotes: string | undefined = item.notes || undefined;

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
      status: override?.finalizeNow ? 'delivered' : 'pending',
      origin: 'balcao',
    });

    if (success) {
      // ===== NFC-e (I9 "Finalizar Pedido" com Venda + NFC-e) =====
      // Cria pdv_sale e dispara emissão. Pop-up de status abre ao final.
      const wantsNfce =
        override?.finalizeNow &&
        override?.documentMode === 'sale_with_nfce' &&
        fiscalEnabled &&
        !!company?.id;
      if (wantsNfce) {
        if (!currentRegister) {
          toast.error('Caixa precisa estar aberto para emitir NFC-e.');
          setIsSubmitting(false);
          return;
        }
        try {
          const saleItems = cart.map((item) => ({
            product_id: item.product.id || null,
            product_name: item.product.name,
            quantity: item.quantity,
            unit_price:
              item.product.price + item.selectedOptionals.reduce((s, o) => s + o.price, 0),
          }));
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const saleId = authUser
            ? await addSale(
                saleItems,
                override!.paymentMethodId,
                authUser.id,
                override!.discount || 0,
                customerName.trim(),
                `[EXPRESS] Pagamento: ${paymentName}${overrideTefNote}`,
              )
            : null;

          if (saleId) {
            const nfceItems: NFCeItem[] = saleItems.map((it) => {
              const product = it.product_id ? products.find((p) => p.id === it.product_id) : null;
              const taxRule = product?.taxRuleId
                ? taxRules.find((tr) => tr.id === product.taxRuleId)
                : null;
              return {
                codigo: it.product_id || 'AVULSO',
                descricao: it.product_name,
                ncm: taxRule?.ncm || '00000000',
                cfop: taxRule?.cfop || '5102',
                unidade: 'UN',
                quantidade: it.quantity,
                valor_unitario: it.unit_price,
                csosn: taxRule?.csosn || '102',
                aliquota_icms: taxRule?.icms_aliquot || 0,
                cst_pis: taxRule?.pis_cst || '49',
                aliquota_pis: taxRule?.pis_aliquot || 0,
                cst_cofins: taxRule?.cofins_cst || '49',
                aliquota_cofins: taxRule?.cofins_aliquot || 0,
              };
            });
            const externalId = `EXPRESS-${currentRegister.id.substring(0, 8)}-${Date.now()}`;
            const cleanDoc = (override?.customerDocument || '').replace(/\D/g, '');
            const destinatario =
              cleanDoc.length === 11
                ? { cpf: cleanDoc, nome: customerName || undefined }
                : cleanDoc.length === 14
                ? { cnpj: cleanDoc, nome: customerName || undefined }
                : undefined;
            await emitirNFCe(company!.id, saleId, {
              external_id: externalId,
              itens: nfceItems,
              valor_desconto: override?.discount || 0,
              valor_frete: 0,
              observacoes: customerName ? `Cliente: ${customerName}` : undefined,
              destinatario,
              tef: overrideTefData,
            } as any);
            toast.success('NFC-e enviada para processamento!');

            const { data: rec } = await supabase
              .from('nfce_records')
              .select('*')
              .eq('sale_id', saleId)
              .maybeSingle();
            if (rec) {
              setNfceRecord(rec as unknown as NFCeRecord);
              setNfceAutoPrint(!!override?.printDocument);
              setNfceDialogOpen(true);
            }
          }
        } catch (err: any) {
          console.error('[Express] NFC-e emission error:', err);
          toast.error(
            `Pedido criado, mas erro ao emitir NFC-e: ${err?.message || 'erro desconhecido'}`,
          );
        }
      }

      // Fluxo "Finalizar Pedido" (I9): só imprime recibo, sem comanda de produção
      if (override?.finalizeNow && company?.id) {
        // Quando NFC-e foi solicitada, o pop-up pós-venda controla a impressão do DANFE.
        // Recibo simples só é gerado para "Somente Venda" + opção "Imprimir".
        const shouldPrintReceipt =
          override?.documentMode !== 'sale_with_nfce' && override?.printDocument !== false;
        if (shouldPrintReceipt) {
        try {
          const paperSize = (settings.printerPaperSize as '58mm' | '80mm') || '80mm';
          const printItems = cart.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price + item.selectedOptionals.reduce((s, o) => s + o.price, 0),
            notes: item.notes || undefined,
          }));
          await printOnlyReceipt({
            companyId: company.id,
            orderCode: 'EXPRESS',
            dailyNumber: 0,
            customerName: customerName.trim(),
            items: printItems,
            total: effectiveTotal,
            notes: `Pagamento: ${paymentName}${override.discount > 0 ? ` | Desconto: R$ ${override.discount.toFixed(2)}` : ''}`,
            paperSize,
          });
        } catch (e) {
          console.error('Erro ao enfileirar recibo:', e);
        }
        }
      } else if (settings.autoPrintProductionTicket && company?.id) {
        // Enfileira comanda de produção (mesmo padrão do Waiter)
        try {
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

            // Descrição do produto sai APENAS na comanda de produção,
            // e somente quando a categoria tem "Imprimir descrição" ligada.
            let description: string | undefined;
            if (item.product.description) {
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
            // Lancheria I9: previsão = criação + (máximo do "Prazo estimado de entrega" − 10 min).
            showReadyTime: isLancheriaI9,
            readyOffsetMinutes: isLancheriaI9
              ? computeReadyOffsetMinutes(settings.estimatedWaitTime, 30)
              : undefined,
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
    setPickupChargeOpen(false);
    if (draftKey) {
      try { localStorage.removeItem(draftKey); } catch {}
    }
    draftRestoreNotifiedRef.current = false;
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
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Pedido Express</DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center justify-between px-2 py-2">
            {stepLabels.map((s, i) => {
              const Icon = s.icon;
              const stepNum = (i + 1) as Step;
              const isActive = step === stepNum;
              // Lancheria I9 + Cliente Loja: marcar etapas 2, 3 e 4 como concluídas
              // (mesmo estando na etapa 5) para refletir o atalho automático.
              const autoFilledByShortcut =
                isLancheriaI9 && isClienteLoja && step === 5 && (stepNum === 2 || stepNum === 3 || stepNum === 4);
              const isDone = step > stepNum || autoFilledByShortcut;
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

          <div
            ref={contentScrollRef}
            onScroll={(event) => {
              if (step === 1) pendingScrollTopRef.current = event.currentTarget.scrollTop;
            }}
            className="flex-1 overflow-y-auto space-y-4 px-2 pb-6"
          >
            {/* Step 1: Products — catalog-style browsing */}
            {step === 1 && (
              <div className="space-y-3">
                {isLancheriaI9 ? (
                  // I9: layout idêntico ao cardápio público (categorias em cards com foto → subcategorias → produtos)
                  <PDVV2CategoryBrowser
                    companyId={company?.id}
                    pdvOnly
                    onProductSelect={handleProductClick}
                    maxHeightClassName="max-h-[60vh]"
                  />
                ) : productsLoading || groupsLoading ? (
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
                    // Lancheria da I9: telefone "limpo" 99999999999 (sem máscara)
                    setCustomerPhone(isLancheriaI9 ? '99999999999' : '(99) 99999-9999');
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
                {/* Lancheria I9: forma de pagamento é definida no pop-up de cobrança
                    ("Finalizar Pedido"). Para "Enviar para Cozinha" a cobrança ocorre
                    apenas quando o status virar "Pronto". */}
                {!isLancheriaI9 && (
                  <>
                    <Label className="font-bold">Forma de pagamento *</Label>
                    {paymentLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
                ) : visiblePaymentMethods.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    {isClienteLoja
                      ? 'Cliente Loja aceita apenas Dinheiro ou PIX. Cadastre uma dessas formas.'
                      : 'Nenhuma forma de pagamento cadastrada.'}
                  </p>
                ) : (
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                    <div className="grid grid-cols-2 gap-3">
                      {visiblePaymentMethods.map(pm => (
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
                    🏪 "Cliente Loja" aceita apenas Dinheiro ou PIX.
                  </p>
                )}
                  </>
                )}

                {/* Mini seletor TEF inline — aparece quando método selecionado é TEF */}
                {!isLancheriaI9 && (() => {
                  const sel = activePaymentMethods.find(m => m.id === paymentMethod) as any;
                  const integ = sel?.integration_type;
                  const isTef = integ === 'tef_pinpad' || integ === 'tef_smartpos';
                  if (!isTef) return null;
                  return (
                    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-3">
                      <p className="text-xs font-semibold text-primary flex items-center gap-1">
                        <CreditCard className="w-3 h-3" /> Configuração TEF
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {(['credit', 'debit', 'pix'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTefCardType(t)}
                            className={cn(
                              "px-2 py-2 rounded-md text-xs font-medium border-2 transition-colors",
                              tefCardType === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"
                            )}
                          >
                            {t === 'credit' ? 'Crédito' : t === 'debit' ? 'Débito' : 'Pix'}
                          </button>
                        ))}
                      </div>
                      {tefCardType === 'credit' && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            {(['avista', 'loja', 'adm'] as const).map(m => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setTefInstallmentMode(m)}
                                className={cn(
                                  "px-2 py-1.5 rounded-md text-xs font-medium border-2 transition-colors",
                                  tefInstallmentMode === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"
                                )}
                              >
                                {m === 'avista' ? '1x à vista' : m === 'loja' ? 'Parc. LOJA' : 'Parc. ADM'}
                              </button>
                            ))}
                          </div>
                          {tefInstallmentMode !== 'avista' && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs whitespace-nowrap">Parcelas:</Label>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={2}
                                max={12}
                                value={tefInstallments}
                                onChange={(e) => setTefInstallments(e.target.value)}
                                className="h-8 w-20 text-sm"
                              />
                              <span className="text-xs text-muted-foreground">(2 a 12)</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Documento fiscal — apenas para Retirada.
                    Lancheria I9: oculto aqui; aparece como pop-up apenas no fluxo
                    "Finalizar Pedido" (mesmo padrão do fechamento de comanda). */}
                {deliveryType === 'retirada' && !isLancheriaI9 && (
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
                        if (isLancheriaI9) return null;
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

          {/* TEF status banner */}
          {tefProcessing && (
            <div className="mx-2 mt-2 rounded-lg border-2 border-primary bg-primary/10 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                <p className="text-sm font-medium text-primary truncate">{tefStatus || 'Aguardando TEF...'}</p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { tefCancelRef.current = true; }}
              >
                Cancelar TEF
              </Button>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-4 pb-4 border-t border-border mt-4">
            {step > 1 ? (
              <Button variant="outline" className="flex-1 gap-2" onClick={goBack} disabled={tefProcessing}>
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={() => { resetForm(); onOpenChange(false); }} disabled={tefProcessing}>
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
            ) : isLancheriaI9 ? (
              // Lancheria I9 — Dois botões: enviar p/ cozinha (sem pagamento) ou finalizar (paga + entrega)
              <>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => setPickupChargeOpen(true)}
                  disabled={cart.length === 0 || isSubmitting || tefProcessing}
                  title="Cobra agora e marca como entregue (sem comanda de produção)"
                >
                  Finalizar Pedido
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={() => handleSubmit()}
                  disabled={!canGoNext() || isSubmitting || tefProcessing}
                  title="Cria pedido pendente e imprime comanda de produção (pagamento depois)"
                >
                  {isSubmitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                    : '👨‍🍳 Enviar para Cozinha'}
                </Button>
              </>
            ) : (
              <Button className="flex-1 gap-2" onClick={() => handleSubmit()} disabled={!canGoNext() || isSubmitting || tefProcessing}>
                {tefProcessing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {tefStatus || 'TEF...'}</>
                  : isSubmitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                    : '✅ Confirmar Pedido'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Detail Dialog — identical to the online catalog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => { if (!open) { setSelectedProduct(null); setSelectedOptionals([]); setSelectedGroupItems({}); setItemNotes(''); } }}>
        <DialogContent
          className="max-h-[85dvh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
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
                  onChangeGroupItemQty={isLancheriaI9 ? changeGroupItemQty : undefined}
                  onNotesChange={setItemNotes}
                  onAddToCart={addToCart}
                  isI9={isLancheriaI9}
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
                                const itemQty = selectedGroupItems[group.id]?.get(item.id) || 0;
                                const isSelected = itemQty > 0;
                                const useQtyControls = isLancheriaI9 && group.maxQuantityPerItem > 1;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className={cn(
                                      "relative rounded-xl border-2 overflow-hidden transition-all text-left",
                                      isSelected ? "border-primary ring-2 ring-primary/30 shadow-md" : "border-border hover:border-primary/50"
                                    )}
                                    onClick={!useQtyControls ? () => toggleGroupItem(group.id, item.id, group.maxSelect) : undefined}
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
                                    {useQtyControls ? (
                                      <div className="flex items-center justify-center gap-1 p-1">
                                        <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); changeGroupItemQty(group.id, item.id, -1, group.maxSelect, group.maxQuantityPerItem); }}>
                                          <Minus className="w-3 h-3" />
                                        </Button>
                                        <span className="w-5 text-center text-xs tabular-nums font-bold">{itemQty}</span>
                                        <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); changeGroupItemQty(group.id, item.id, 1, group.maxSelect, group.maxQuantityPerItem); }}>
                                          <Plus className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ) : isSelected ? (
                                      <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                        <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            group.items.filter(i => i.active).map(item => {
                              const itemQty = selectedGroupItems[group.id]?.get(item.id) || 0;
                              const isSelected = itemQty > 0;
                              const useQtyControls = isLancheriaI9 && group.maxQuantityPerItem > 1;
                              return (
                                <div
                                  key={item.id}
                                  className={cn(
                                    "flex items-center justify-between p-3 border rounded-lg transition-colors",
                                    isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50",
                                    !useQtyControls && "cursor-pointer"
                                  )}
                                  onClick={!useQtyControls ? () => toggleGroupItem(group.id, item.id, group.maxSelect) : undefined}
                                >
                                  <div className="flex items-center gap-3">
                                    {!useQtyControls && <Checkbox checked={isSelected} onCheckedChange={() => toggleGroupItem(group.id, item.id, group.maxSelect)} />}
                                    {item.imageUrl && (
                                      <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                                    )}
                                    <span className="font-medium">{item.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                  {item.price > 0 && (
                                    <span className="text-green-600 font-semibold">+R$ {formatPrice(item.price)}</span>
                                  )}
                                  {useQtyControls && (
                                    <div className="flex items-center gap-1">
                                      <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => changeGroupItemQty(group.id, item.id, -1, group.maxSelect, group.maxQuantityPerItem)}>
                                        <Minus className="w-3 h-3" />
                                      </Button>
                                      <span className="w-6 text-center text-sm tabular-nums font-bold">{itemQty}</span>
                                      <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => changeGroupItemQty(group.id, item.id, 1, group.maxSelect, group.maxQuantityPerItem)}>
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                                  </div>
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
        title={isLancheriaI9 && step === 5 ? 'Finalizar Pedido' : 'Cobrar Retirada'}
        channel="express"
        // I9: mostra TODAS as formas (incluindo TEF) mesmo com Cliente Loja.
        // Demais lojas mantêm a restrição original (Cliente Loja → apenas dinheiro).
        cashOnly={isClienteLoja && !isLancheriaI9}
        showDocumentMode
        // I9: cobrar TEF antes de perguntar NFC-e/imprimir. Se a cobrança não
        // for aprovada, nada segue — o lojista pode reprocessar/escolher outra
        // forma sem ter respondido pop-ups à toa.
        chargeTefBeforePopups
        checkoutItems={isLancheriaI9 ? cart.map(i => ({ name: i.product.name, quantity: i.quantity, unit_price: i.product.price + (i.selectedOptionals?.reduce((s, o) => s + o.price, 0) || 0) })) : undefined}
        onConfirm={async ({
          paymentMethodId,
          paymentName,
          finalTotal,
          discount,
          documentMode: dm,
          printDocument,
          tefOptions,
          tefIntegration,
          customerDocument,
          prechargedTef,
        }) => {
          // Se chamado a partir da etapa 5 (I9 = "Finalizar Pedido"), cria pedido já entregue
          // e imprime apenas recibo. Caso contrário (Retirada vinda da etapa 4), mantém fluxo original.
          const finalizeNow = isLancheriaI9 && step === 5;
          await handleSubmit({
            paymentMethodId,
            paymentName,
            finalTotal,
            discount,
            finalizeNow,
            documentMode: dm,
            printDocument,
            tefOptions,
            tefIntegration,
            customerDocument,
            prechargedTef,
          });
          setPickupChargeOpen(false);
        }}
      />

      {/* NFC-e — pop-up de status pós-venda (mesmo padrão do PDV V2) */}
      <PDVV2NFCePostSaleDialog
        open={nfceDialogOpen}
        onOpenChange={(o) => {
          setNfceDialogOpen(o);
          if (!o) setNfceRecord(null);
        }}
        companyId={company?.id}
        initialRecord={nfceRecord}
        autoPrint={nfceAutoPrint}
      />
    </>
  );
}
