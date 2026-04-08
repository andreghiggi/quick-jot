import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProducts } from '@/hooks/useProducts';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useCategories } from '@/hooks/useCategories';
import { useOptionalGroups, OptionalGroup } from '@/hooks/useOptionalGroups';
import { useDeliveryNeighborhoods } from '@/hooks/useDeliveryNeighborhoods';
import { useBusinessHours } from '@/hooks/useBusinessHours';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { Product, ProductOptional, CartItem } from '@/types/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShoppingCart, Plus, Minus, Trash2, Send, CheckCircle, Search, Clock, AlertCircle, MessageSquare, Copy, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { MenuV2 } from '@/components/menu/MenuV2';
import { AddedToCartDialog } from '@/components/menu/AddedToCartDialog';
import { LateralOptionalsWizard } from '@/components/menu/LateralOptionalsWizard';

interface Company {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
}

export default function Menu() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  
  const [company, setCompany] = useState<Company | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyNotFound, setCompanyNotFound] = useState(false);

  // Fetch company by slug
  useEffect(() => {
    async function fetchCompany() {
      if (!slug) {
        // Se não tem slug, redireciona para página inicial
        navigate('/');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name, slug, phone, address')
          .eq('slug', slug)
          .eq('active', true)
          .single();

        if (error || !data) {
          setCompanyNotFound(true);
        } else {
          setCompany(data);
        }
      } catch (error) {
        console.error('Error fetching company:', error);
        setCompanyNotFound(true);
      } finally {
        setCompanyLoading(false);
      }
    }

    fetchCompany();
  }, [slug, navigate]);

  const { products, loading: productsLoading, getActiveProducts, getNewProducts } = useProducts({ companyId: company?.id });
  const { settings, loading: settingsLoading } = useStoreSettings({ companyId: company?.id });
  const { categories, loading: categoriesLoading } = useCategories({ companyId: company?.id });
  const { neighborhoods, loading: neighborhoodsLoading, getActiveNeighborhoods } = useDeliveryNeighborhoods({ companyId: company?.id });
  const { loading: hoursLoading, isCurrentlyOpen, getFormattedHours, config: hoursConfig } = useBusinessHours({ companyId: company?.id });
  const { groups: optionalGroups, loading: groupsLoading } = useOptionalGroups({ companyId: company?.id });
  const { activePaymentMethods, loading: paymentMethodsLoading } = usePaymentMethods({ companyId: company?.id });
  const isOpen = isCurrentlyOpen();
  const schedulingEnabled = settings.acceptOrderScheduling;
  const canOrder = isOpen || schedulingEnabled;
  const formattedHours = getFormattedHours();
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOptionals, setSelectedOptionals] = useState<ProductOptional[]>([]);
  const [itemNotes, setItemNotes] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCpf, setCustomerCpf] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryComplement, setDeliveryComplement] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [changeFor, setChangeFor] = useState('');
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'city' | 'interior' | 'neighborhood' | ''>('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('');
  const [orderSent] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerLoaded, setCustomerLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddedToCart, setShowAddedToCart] = useState(false);
  const [lastAddedItem, setLastAddedItem] = useState<CartItem | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Optional group selections state
  const [selectedGroupItems, setSelectedGroupItems] = useState<Record<string, Set<string>>>({});

  const brazilianStates = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];
  // Check if current user is an admin of this company
  useEffect(() => {
    async function checkAdmin() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !company?.id) return;
      const { data } = await supabase
        .from('company_users')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('company_id', company.id)
        .maybeSingle();
      setIsAdmin(!!data);
    }
    checkAdmin();
  }, [company?.id]);

  const menuLink = `${window.location.origin}/cardapio/${slug}`;
  const copyMenuLink = useCallback(() => {
    navigator.clipboard.writeText(menuLink);
    toast.success('Link copiado!');
  }, [menuLink]);

  function isValidCpf(cpf: string): boolean {
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i)) * (10 - i);
    let rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    if (rest !== parseInt(cpf.charAt(9))) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i)) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    return rest === parseInt(cpf.charAt(10));
  }

  function formatCpf(cpf: string): string {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  function handleCpfChange(value: string) {
    // Only allow digits, dots and dash
    const digits = value.replace(/\D/g, '').slice(0, 11);
    // Auto-format as user types
    let formatted = digits;
    if (digits.length > 9) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
    else if (digits.length > 6) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
    else if (digits.length > 3) formatted = `${digits.slice(0,3)}.${digits.slice(3)}`;
    setCustomerCpf(formatted);
  }

  const loading = companyLoading || productsLoading || settingsLoading || categoriesLoading || neighborhoodsLoading || hoursLoading || groupsLoading;

  // Build category name -> id map for optional groups
  const categoryIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { map[c.name] = c.id; });
    return map;
  }, [categories]);

  // Build category name -> emoji map for MenuV2
  const categoryEmojiMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { if (c.emoji) map[c.name] = c.emoji; });
    return map;
  }, [categories]);

  // Build category name -> image map for MenuV2
  const categoryImageMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { if (c.imageUrl) map[c.name] = c.imageUrl; });
    return map;
  }, [categories]);

  // Floating photo animation enabled per establishment
  const floatingPhoto = settings.floatingPhoto;

  // Get optional groups applicable to a specific product (with per-product overrides)
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

  // Get applicable groups for the currently selected product, sorted by display_order
  const selectedProductGroups = useMemo(() => {
    if (!selectedProduct) return [];
    return getGroupsForProduct(selectedProduct.id, selectedProduct.category)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [selectedProduct, optionalGroups, categoryIdByName]);

  // Load customer data when phone changes (with debounce)
  useEffect(() => {
    if (!customerPhone || customerPhone.length < 10 || !company?.id || customerLoaded) return;
    
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return;

    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('company_id', company.id)
          .eq('phone', cleanPhone)
          .maybeSingle();

        if (data && !error) {
          // Auto-fill customer data
          if (data.name && !customerName) setCustomerName(data.name);
          if (data.cpf && !customerCpf) setCustomerCpf(data.cpf);
          if (data.city && !deliveryCity) setDeliveryCity(data.city);
          if (data.state && !deliveryState) setDeliveryState(data.state);

          // Parse structured address for i9 format: "Logradouro, Número - Complemento - Bairro | Ref: Referência"
          if (data.address && company?.slug?.startsWith('lancheria-da-i9')) {
            const addr = data.address;
            // Split by " | Ref: " to get reference
            const [mainPart, refPart] = addr.split(/\s*\|\s*Ref:\s*/);
            if (refPart && !deliveryReference) setDeliveryReference(refPart.trim());

            // Split main part by " - " to get bairro
            const dashParts = mainPart.split(/\s*-\s*/);
            if (dashParts.length >= 2) {
              // Last part is bairro
              const bairro = dashParts.pop()?.trim() || '';
              if (bairro && !deliveryNeighborhood) setDeliveryNeighborhood(bairro);
              // If there's a complement (middle part)
              if (dashParts.length >= 2) {
                const complement = dashParts.pop()?.trim() || '';
                if (complement && !deliveryComplement) setDeliveryComplement(complement);
              }
              // Remaining is "Logradouro, Número"
              const streetNum = dashParts.join(' - ');
              const commaIdx = streetNum.lastIndexOf(',');
              if (commaIdx > 0) {
                const street = streetNum.substring(0, commaIdx).trim();
                const num = streetNum.substring(commaIdx + 1).trim();
                if (street && !deliveryAddress) setDeliveryAddress(street);
                if (num && !deliveryNumber) setDeliveryNumber(num);
              } else {
                if (streetNum && !deliveryAddress) setDeliveryAddress(streetNum);
              }
            } else {
              if (mainPart && !deliveryAddress) setDeliveryAddress(mainPart);
            }
          } else if (data.address && !deliveryAddress) {
            setDeliveryAddress(data.address);
          }

          setCustomerLoaded(true);
          toast.success('Dados carregados automaticamente!', { duration: 2000 });
        }
      } catch (error) {
        console.error('Error loading customer:', error);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [customerPhone, company?.id]);

  // Reset customerLoaded when phone changes significantly
  useEffect(() => {
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setCustomerLoaded(false);
    }
  }, [customerPhone]);

  const activeProducts = getActiveProducts();
  const newProducts = getNewProducts();
  
  // Get categories in the order defined by the store owner
  // Use the sorted categories from useCategories hook, fallback to product categories
  const orderedCategoryNames = categories.map(c => c.name);
  const productCategorySet = new Set(activeProducts.map((p) => p.category));
  
  // Filter to only categories that have active products, maintaining the configured order
  const productCategories = orderedCategoryNames.filter(catName => productCategorySet.has(catName));
  
  // Also include any product categories not in the categories table (edge case)
  const unconfiguredCategories = [...productCategorySet].filter(cat => !orderedCategoryNames.includes(cat));
  const allOrderedCategories = [...productCategories, ...unconfiguredCategories];
  
  // Filter products based on selected category and search
  const filteredProducts = activeProducts.filter((product) => {
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Group products by category, then order groups by the configured category order
  const productsByCategory = filteredProducts.reduce((acc, product) => {
    if (!acc[product.category]) acc[product.category] = [];
    acc[product.category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);
  
  // Create ordered entries based on configured category order
  const groupedProducts: [string, Product[]][] = allOrderedCategories
    .filter(catName => productsByCategory[catName])
    .map(catName => [catName, productsByCategory[catName]]);

  function toggleOptional(optional: ProductOptional) {
    setSelectedOptionals((prev) =>
      prev.find((o) => o.id === optional.id)
        ? prev.filter((o) => o.id !== optional.id)
        : [...prev, optional]
    );
  }

  function toggleGroupItem(groupId: string, itemId: string, maxSelect: number) {
    const effectiveMax = maxSelect > 0 ? maxSelect : 1;
    setSelectedGroupItems(prev => {
      const current = new Set(prev[groupId] || []);
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        if (current.size >= effectiveMax) {
          if (effectiveMax === 1) {
            // Replace the single selection
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

  function addToCart() {
    if (!selectedProduct) return;

    // Validate min selections for optional groups
    for (const group of selectedProductGroups) {
      const selected = selectedGroupItems[group.id];
      const count = selected ? selected.size : 0;
      if (group.minSelect > 0 && count < group.minSelect) {
        toast.error(`Selecione pelo menos ${group.minSelect} item(ns) em "${group.name}"`);
        return;
      }
    }

    // Collect selected group items as ProductOptional-like objects
    const groupOptionals: ProductOptional[] = [];
    for (const group of selectedProductGroups) {
      const selected = selectedGroupItems[group.id];
      if (!selected) continue;
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
        }
      }
    }

    // Merge old-style optionals + group optionals
    const allOptionals = [...selectedOptionals, ...groupOptionals];

    const newItem: CartItem = {
      product: selectedProduct,
      quantity: 1,
      selectedOptionals: allOptionals,
      notes: itemNotes || undefined,
    };

    setCart((prev) => [...prev, newItem]);
    setLastAddedItem(newItem);
    setSelectedProduct(null);
    setSelectedOptionals([]);
    setSelectedGroupItems({});
    setItemNotes('');
    setShowAddedToCart(true);
  }

  function updateQuantity(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item, i) =>
          i === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function calculateItemTotal(item: CartItem): number {
    const optionalsTotal = item.selectedOptionals.reduce((sum, opt) => sum + opt.price, 0);
    return (item.product.price + optionalsTotal) * item.quantity;
  }

  // Calculate delivery fee based on type
  const getDeliveryFee = () => {
    if (deliveryType === 'pickup') return 0;
    if (deliveryType === 'city') return settings.deliveryFeeCity || 0;
    if (deliveryType === 'interior') return settings.deliveryFeeInterior || 0;
    if (deliveryType === 'neighborhood' && selectedNeighborhood) {
      const neighborhood = getActiveNeighborhoods().find(n => n.id === selectedNeighborhood);
      return neighborhood?.deliveryFee || 0;
    }
    return 0;
  };

  const deliveryFee = getDeliveryFee();
  const cartTotal = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const orderTotal = cartTotal + deliveryFee;

  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  async function sendToWhatsApp() {
    // Prevent double submission
    if (isSubmitting) return;
    
    // Check if store is open or scheduling is enabled
    if (!canOrder) {
      toast.error('Estabelecimento fechado no momento');
      return;
    }
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 10) {
      toast.error('Informe um número de telefone válido');
      return;
    }
    if (!customerName.trim()) {
      toast.error('Informe seu nome completo');
      return;
    }
    // Validate full name (at least first + last name)
    const nameParts = customerName.trim().split(/\s+/);
    if (nameParts.length < 2 || nameParts.some(p => p.length < 2)) {
      toast.error('Informe seu nome completo (nome e sobrenome)');
      return;
    }
    // Validate CPF (required)
    const cleanCpf = customerCpf.replace(/\D/g, '');
    if (!cleanCpf || cleanCpf.length !== 11 || !isValidCpf(cleanCpf)) {
      toast.error('Informe um CPF válido');
      return;
    }
    const isStructuredAddress = company?.slug?.startsWith('lancheria-da-i9');
    if (isStructuredAddress) {
      if (!deliveryAddress.trim()) { toast.error('Informe o logradouro'); return; }
      if (!deliveryNumber.trim()) { toast.error('Informe o número'); return; }
      if (!deliveryNeighborhood.trim()) { toast.error('Informe o bairro'); return; }
      if (!deliveryReference.trim()) { toast.error('Informe o ponto de referência'); return; }
    } else {
      if (!deliveryAddress.trim()) { toast.error('Informe o endereço'); return; }
      if (!deliveryCity.trim()) { toast.error('Informe a cidade'); return; }
      if (!deliveryState) { toast.error('Selecione o estado'); return; }
    }
    if (!deliveryType) {
      toast.error('Selecione o tipo de entrega');
      return;
    }
    if (deliveryType === 'neighborhood' && !selectedNeighborhood) {
      toast.error('Selecione o bairro');
      return;
    }
    if (!paymentMethod) {
      toast.error('Selecione a forma de pagamento');
      return;
    }
    if (cart.length === 0) {
      toast.error('Carrinho vazio');
      return;
    }

    // Use company phone or settings phone
    const phoneToUse = company?.phone || settings.storePhone;

    if (!phoneToUse) {
      toast.error('Número do WhatsApp da loja não configurado');
      return;
    }

    // Build full address - only for delivery, not pickup
    let fullAddress = '';
    if (deliveryType !== 'pickup') {
      const isStructuredAddr = company?.slug?.startsWith('lancheria-da-i9');
      if (isStructuredAddr) {
        fullAddress = `${deliveryAddress}, ${deliveryNumber}`;
        if (deliveryComplement.trim()) fullAddress += ` - ${deliveryComplement.trim()}`;
        fullAddress += ` - ${deliveryNeighborhood}`;
        fullAddress += ` | Ref: ${deliveryReference}`;
      } else {
        fullAddress = deliveryAddress;
        if (deliveryCity) fullAddress += ` - ${deliveryCity}`;
        if (deliveryState) fullAddress += `/${deliveryState}`;
      }
    }

    // Get delivery type label
    let deliveryTypeLabel = 'Retirada';
    if (deliveryType === 'city') deliveryTypeLabel = 'Entrega Cidade';
    else if (deliveryType === 'interior') deliveryTypeLabel = 'Entrega Interior';
    else if (deliveryType === 'neighborhood' && selectedNeighborhood) {
      const neighborhood = getActiveNeighborhoods().find(n => n.id === selectedNeighborhood);
      deliveryTypeLabel = `Entrega ${neighborhood?.neighborhoodName || 'Bairro'}`;
    }

    // Save order to database
    setIsSubmitting(true);
    try {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: customerName,
          customer_phone: customerPhone || null,
          delivery_address: fullAddress || null,
          notes: `Pagamento: ${paymentMethod}${(() => { const pm = activePaymentMethods.find(m => m.name === paymentMethod); return pm?.pix_key ? ` (Chave PIX: ${pm.pix_key})` : ''; })()}${changeFor.trim() ? ` (Troco para R$ ${changeFor.trim()})` : ''} | ${deliveryTypeLabel}${deliveryFee > 0 ? ` (R$ ${deliveryFee.toFixed(2)})` : ''}`,
          total: orderTotal,
          status: 'pending',
          company_id: company?.id || null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Save order items
      const orderItems = cart.map((item) => ({
        order_id: newOrder.id,
        product_id: item.product.id,
        name: item.product.name + (item.selectedOptionals.length > 0 ? ` (${item.selectedOptionals.map(o => o.name).join(', ')})` : ''),
        quantity: item.quantity,
        price: item.product.price + item.selectedOptionals.reduce((sum, opt) => sum + opt.price, 0),
        notes: item.notes || null,
        company_id: company?.id || null,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Save/update customer data for future auto-fill
      if (customerPhone && company?.id) {
        const cleanPhone = customerPhone.replace(/\D/g, '');
        if (cleanPhone.length >= 10) {
          try {
            await supabase
              .from('customers')
              .upsert({
                company_id: company.id,
                phone: cleanPhone,
                name: customerName,
                cpf: customerCpf.replace(/\D/g, '') || null,
                address: company?.slug?.startsWith('lancheria-da-i9')
                  ? `${deliveryAddress}, ${deliveryNumber}${deliveryComplement ? ` - ${deliveryComplement}` : ''} - ${deliveryNeighborhood} | Ref: ${deliveryReference}`
                  : (deliveryAddress || null),
                city: deliveryCity || null,
                state: deliveryState || null,
              }, { 
                onConflict: 'company_id,phone',
                ignoreDuplicates: false 
              });
          } catch (customerError) {
            console.error('Error saving customer data:', customerError);
          }
        }
      }

      console.log('Order saved to database:', newOrder.id);

      // Notify store via WhatsApp (fire-and-forget, don't block the user)
      if (company?.id) {
        supabase.functions.invoke('notify-store-order', {
          body: { companyId: company.id, orderId: newOrder.id },
        }).catch(err => console.error('Store notification failed:', err));
      }

      // Send scheduled order confirmation is handled server-side in notify-store-order
    } catch (error) {
      console.error('Error saving order to database:', error);
      setIsSubmitting(false);
      toast.error('Erro ao salvar pedido. Tente novamente.');
      return;
    }

    // Build WhatsApp message matching thermal print format
    const storeName = settings.storeName || company?.name || 'Comanda Tech';
    let message = `═══════════════════\n`;
    message += `      *MEU PEDIDO*\n`;
    message += `   _${storeName}_\n`;
    message += `═══════════════════\n\n`;
    message += `*Cliente:* ${customerName}\n`;
    if (customerCpf) message += `*CPF:* ${formatCpf(customerCpf.replace(/\D/g, ''))}\n`;
    if (customerPhone) message += `*Telefone:* ${customerPhone}\n`;
    message += `*Tipo:* ${deliveryTypeLabel}\n`;
    message += `*Pagamento:* ${paymentMethod}\n`;
    if (changeFor.trim()) {
      message += `*Troco para:* R$ ${changeFor.trim()}\n`;
    }
    const selectedPixMethod = activePaymentMethods.find(m => m.name === paymentMethod);
    if (selectedPixMethod?.pix_key) {
      message += `*Chave PIX:* ${selectedPixMethod.pix_key}\n`;
    }
    if (fullAddress) message += `*Endereço:* ${fullAddress}\n`;
    message += `\n───────────────────\n`;
    message += `*ITENS DO PEDIDO*\n`;
    message += `───────────────────\n`;

    cart.forEach((item) => {
      // Extract base product name (remove text in parentheses for "Adicionais" line)
      const productName = item.product.name;
      const match = productName.match(/^(.*?)\s*\((.+)\)$/);
      const baseName = match ? match[1].trim() : productName;
      const inlineOptionals = match ? match[2].trim() : null;
      
      message += `\n*${baseName.toUpperCase()}*`;
      message += `\nQuantidade: ${item.quantity}`;
      message += `\nR$ ${calculateItemTotal(item).toFixed(2)}`;
      
      // Show inline optionals from product name parentheses
      if (inlineOptionals) {
        message += `\n_Adicionais: ${inlineOptionals}_`;
      }
      
      // Show selected optionals
      if (item.selectedOptionals.length > 0) {
        message += `\n_Adicionais: ${item.selectedOptionals.map((o) => o.name).join(', ')}_`;
      }
      if (item.notes) {
        message += `\n_Obs: ${item.notes}_`;
      }
      message += `\n`;
    });

    message += `\n───────────────────\n`;
    message += `*Subtotal: R$ ${cartTotal.toFixed(2)}*\n`;
    if (deliveryFee > 0) {
      message += `*Taxa de entrega: R$ ${deliveryFee.toFixed(2)}*\n`;
    }
    message += `*TOTAL: R$ ${orderTotal.toFixed(2)}*\n`;
    message += `───────────────────`;

    const cleanPhone = phoneToUse.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const encodedMessage = encodeURIComponent(message);
    const generatedWhatsappUrl = `https://wa.me/${phoneWithCountry}?text=${encodedMessage}`;

    // Open WhatsApp first
    window.open(generatedWhatsappUrl, '_blank');

    // Clear cart and reset form
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerCpf('');
    setDeliveryAddress('');
    setDeliveryNumber('');
    setDeliveryComplement('');
    setDeliveryNeighborhood('');
    setDeliveryReference('');
    setDeliveryCity('');
    setDeliveryState('');
    setDeliveryType('');
    setSelectedNeighborhood('');
    setPaymentMethod('');
    setChangeFor('');
    setIsCartOpen(false);
    setIsSubmitting(false);

    // Notify user
    toast.success('Pedido enviado com sucesso! Verifique o WhatsApp.');
  }

  // No longer needed - order flow returns to menu automatically

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando cardápio...</p>
      </div>
    );
  }

  if (companyNotFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <span className="text-3xl">🔍</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Empresa não encontrada</h2>
              <p className="text-muted-foreground">
                O cardápio que você está procurando não existe ou está inativo.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // orderSent is no longer used - kept for potential future use

  const isV2 = settings.menuLayout === 'v2';

  const adminBanner = isAdmin ? (
    <div className="bg-gray-900 border-b border-gray-700 px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
        <p className="text-sm text-white truncate">
          <strong>🔗 Link do cardápio:</strong>{' '}
          <a href={menuLink} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">
            {menuLink}
          </a>
        </p>
        <Button variant="destructive" size="sm" onClick={copyMenuLink} className="flex-shrink-0">
          <Copy className="h-4 w-4 mr-2" />
          Copiar link
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <>
    {adminBanner}
    {isV2 ? (
      <MenuV2
        company={company}
        settings={settings}
        activeProducts={activeProducts}
        newProducts={newProducts}
        categoryEmojiMap={categoryEmojiMap}
        categoryImageMap={categoryImageMap}
        floatingPhoto={floatingPhoto}
        cartItemsCount={cartItemsCount}
        cartTotal={cartTotal}
        isOpen={isOpen}
        formattedHours={formattedHours}
        onProductSelect={setSelectedProduct}
        onCartOpen={() => setIsCartOpen(true)}
        onNavigateBack={() => navigate(-1)}
      />
    ) : (
    <div className="min-h-screen bg-background pb-24">
      {/* Closed Store Banner */}
      {!isOpen && (
        <div className="bg-destructive/10 border-b border-destructive/20">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm">Estabelecimento fechado</p>
                <p className="text-xs opacity-80">
                  {formattedHours === 'Fechado hoje' 
                    ? 'Não abrimos hoje' 
                    : `Horário de hoje: ${formattedHours}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Fixed Header Container - Banner scrolls away, but name/search/categories stay */}
      <div className={cn("sticky z-20", isOpen ? "top-0" : "top-0")}>
        {/* Store Name + Cart + Search + Categories - Always visible */}
        <div className="bg-card border-b border-border shadow-sm">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              {/* Left side: Back button + Store name */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => navigate(-1)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6"/>
                  </svg>
                </Button>
                <h1 className="text-lg font-bold text-foreground">
                  {settings.storeName || company?.name || 'Cardápio'}
                </h1>
              </div>
              
              {/* Right side: Cart button */}
              <Button
                variant="outline"
                size="sm"
                className="relative flex-shrink-0"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="h-4 w-4" />
                {cartItemsCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {cartItemsCount}
                  </Badge>
                )}
              </Button>
            </div>
            
            {/* Category Pills - horizontally scrollable */}
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
              <Button
                variant={!selectedCategory ? 'default' : 'outline'}
                size="sm"
                className="rounded-full whitespace-nowrap h-7 px-3 text-xs flex-shrink-0"
                onClick={() => setSelectedCategory(null)}
              >
                Todos
              </Button>
              {allOrderedCategories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full whitespace-nowrap h-7 px-3 text-xs flex-shrink-0"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
            
            {/* Search Bar */}
            <div className="mt-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produtos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
          </div>
        </div>
      </div>

      {/* NOVIDADES Carousel */}
      {newProducts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-amber-200 dark:border-amber-800">
          <div className="container mx-auto px-4 py-4">
            <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
              ⭐ NOVIDADES
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
              {newProducts.map((product) => (
                <button
                  key={product.id}
                  className="flex-shrink-0 w-36 bg-card rounded-xl shadow-sm border border-border overflow-hidden text-left hover:shadow-md transition-shadow"
                  onClick={() => setSelectedProduct(product)}
                >
                  {product.imageUrl ? (
                    <div className="w-full h-24 overflow-hidden">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-24 bg-muted flex items-center justify-center">
                      <span className="text-3xl">🍽️</span>
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs font-medium text-foreground line-clamp-2 break-words">{product.name}</p>
                    <p className="text-xs font-bold text-primary mt-0.5">R$ {product.price.toFixed(2)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {settings.bannerUrl && (
        <div className="w-full relative overflow-hidden">
          {/* Blurred background fill */}
          <img
            src={settings.bannerUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
          />
          {/* Crisp centered banner */}
          <img 
            src={settings.bannerUrl} 
            alt="Banner" 
            className="relative w-full max-h-56 sm:max-h-64 object-contain mx-auto"
          />
        </div>
      )}

      {/* Products Grid */}
      <main className="container mx-auto px-4 py-6 space-y-8">
        {groupedProducts.map(([category, categoryProducts]) => (
          <section key={category}>
            <h2 className="text-lg font-bold mb-4 text-foreground border-l-4 border-primary pl-3">
              {category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryProducts.map((product) => (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:border-primary hover:shadow-md transition-all overflow-hidden"
                  onClick={() => setSelectedProduct(product)}
                >
                  <CardContent className="p-0">
                    <div className="flex">
                      {product.imageUrl ? (
                        <div className="w-28 h-28 flex-shrink-0">
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-28 h-28 flex-shrink-0 bg-muted flex items-center justify-center">
                          <span className="text-3xl">🍽️</span>
                        </div>
                      )}
                      <div className="flex-1 p-3 flex flex-col justify-between">
                        <div>
                          <h3 className="font-semibold text-foreground line-clamp-1">{product.name}</h3>
                          {product.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {product.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-primary font-bold">
                            R$ {product.price.toFixed(2)}
                          </p>
                          <Button size="sm" className="h-8 px-3">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}

        {filteredProducts.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Floating cart button - V1 */}
      {cart.length > 0 && !isCartOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-30">
          <Button
            className="w-full py-6 shadow-lg"
            size="lg"
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            Ver carrinho ({cartItemsCount} itens) - R$ {cartTotal.toFixed(2)}
          </Button>
        </div>
      )}
    </div>
    )}

      {/* Product Detail Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => { if (!open) { setSelectedProduct(null); setSelectedOptionals([]); setSelectedGroupItems({}); setItemNotes(''); } }}>
        <DialogContent className="max-h-[85dvh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="px-6 pt-6 pb-3 border-b flex-shrink-0">
            <DialogTitle className="pr-6">{selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
          {selectedProduct && (
            settings.lateralScrollOptionals && (selectedProductGroups.length > 0 || (selectedProduct.optionals && selectedProduct.optionals.filter(o => o.active).length > 0)) ? (
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
                  <img
                    key={selectedProduct.id}
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.name}
                    className={cn("w-full object-cover", floatingPhoto && "kenburns-animate")}
                    style={{ height: '110%', animationPlayState: 'running' }}
                  />
                </div>
              )}
              {selectedProduct.description && (
                <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>
              )}
              <p className="text-2xl font-bold text-primary">
                R$ {selectedProduct.price.toFixed(2)}
              </p>

              {selectedProduct.optionals && selectedProduct.optionals.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Adicionais</Label>
                  {selectedProduct.optionals
                    .filter((o) => o.active)
                    .map((optional) => (
                      <div
                        key={optional.id}
                        className={cn(
                          "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors",
                          selectedOptionals.some((o) => o.id === optional.id) 
                            ? "border-primary bg-primary/5" 
                            : "hover:border-primary/50"
                        )}
                        onClick={() => toggleOptional(optional)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedOptionals.some((o) => o.id === optional.id)}
                            onCheckedChange={() => toggleOptional(optional)}
                          />
                          <span className="font-medium">{optional.name}</span>
                        </div>
                        {optional.price > 0 && (
                          <span className="text-primary font-semibold">
                            +R$ {optional.price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              )}

              {/* Optional Groups (associated by category or product) */}
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
                        /* Visual grid card layout - 3 columns on mobile */
                        <div className="grid grid-cols-3 gap-2">
                          {group.items.filter(i => i.active).map(item => {
                            const isSelected = selectedGroupItems[group.id]?.has(item.id) || false;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={cn(
                                  "relative rounded-xl border-2 overflow-hidden transition-all text-left",
                                  isSelected
                                    ? "border-primary ring-2 ring-primary/30 shadow-md"
                                    : "border-border hover:border-primary/50"
                                )}
                                onClick={() => toggleGroupItem(group.id, item.id, group.maxSelect)}
                              >
                                {item.imageUrl ? (
                                  <div className="w-full aspect-square overflow-hidden">
                                    <img
                                      src={item.imageUrl}
                                      alt={item.name}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-full aspect-square bg-muted flex items-center justify-center">
                                    <span className="text-3xl">🍽️</span>
                                  </div>
                                )}
                                <div className="p-1.5 space-y-0.5">
                                  <p className={cn(
                                    "text-[11px] font-semibold line-clamp-2 leading-tight text-center",
                                    isSelected ? "text-primary" : "text-foreground"
                                  )}>
                                    {item.name}
                                  </p>
                                  {item.price > 0 && (
                                    <p className="text-[10px] text-primary font-medium text-center">
                                      +R$ {item.price.toFixed(2)}
                                    </p>
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
                        /* Default vertical list layout */
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
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleGroupItem(group.id, item.id, group.maxSelect)}
                                />
                                {item.imageUrl && (
                                  <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                                )}
                                <span className="font-medium">{item.name}</span>
                              </div>
                              {item.price > 0 && (
                                <span className="text-primary font-semibold">
                                  +R$ {item.price.toFixed(2)}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ))}
                </div>
              )}

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
          {/* Fixed bottom button - only for non-wizard flow */}
          {selectedProduct && !(settings.lateralScrollOptionals && (selectedProductGroups.length > 0 || (selectedProduct.optionals && selectedProduct.optionals.filter(o => o.active).length > 0))) && (
            <div className="px-6 py-4 border-t flex-shrink-0 bg-background">
              <Button onClick={addToCart} className="w-full" size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar ao carrinho
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Added to Cart Confirmation Dialog */}
      <AddedToCartDialog
        open={showAddedToCart}
        onClose={() => setShowAddedToCart(false)}
        onContinueShopping={() => setShowAddedToCart(false)}
        onGoToCart={() => {
          setShowAddedToCart(false);
          setIsCartOpen(true);
        }}
        lastAddedItem={lastAddedItem}
        cartItems={cart}
        cartItemsCount={cartItemsCount}
        cartTotal={cartTotal}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeFromCart}
      />

      {/* Cart Dialog */}
      <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
        <DialogContent className="max-h-[85dvh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 border-b flex-shrink-0">
            <DialogTitle>Seu Pedido</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Carrinho vazio</p>
            ) : (
              <>
                {cart.map((item, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      {item.product.imageUrl && (
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <p className="font-medium line-clamp-2">{item.product.name}</p>
                          <p className="font-semibold flex-shrink-0 ml-2">R$ {calculateItemTotal(item).toFixed(2)}</p>
                        </div>
                        {item.selectedOptionals.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.selectedOptionals.map((o) => (
                              <p key={o.id} className="text-xs text-muted-foreground flex justify-between pr-2">
                                <span>+ {o.name}</span>
                                <span className="text-foreground/70">
                                  {o.price > 0 ? `R$ ${o.price.toFixed(2)}` : 'Grátis'}
                                </span>
                              </p>
                            ))}
                          </div>
                        )}
                        {item.notes && (
                          <p className="text-xs text-muted-foreground mt-1">Obs: {item.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(index, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(index, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeFromCart(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="border-t pt-4 space-y-3">
                  <div>
                    <Label>Telefone *</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div>
                    <Label>Nome Completo *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nome e sobrenome"
                    />
                  </div>
                  <div>
                    <Label>CPF *</Label>
                    <Input
                      value={customerCpf}
                      onChange={(e) => handleCpfChange(e.target.value)}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      inputMode="numeric"
                    />
                  </div>
                  {company?.slug?.startsWith('lancheria-da-i9') ? (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_92px] sm:items-end">
                        <div className="min-w-0">
                          <Label className="block leading-snug whitespace-normal break-words">Logradouro (rua, avenida, travessa) *</Label>
                          <Input
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                            placeholder="Ex: Rua das Flores"
                          />
                        </div>
                        <div className="min-w-0">
                          <Label className="block leading-snug whitespace-nowrap">Número *</Label>
                          <Input
                            value={deliveryNumber}
                            onChange={(e) => setDeliveryNumber(e.target.value)}
                            placeholder="123"
                            inputMode="numeric"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Complemento</Label>
                        <Input
                          value={deliveryComplement}
                          onChange={(e) => setDeliveryComplement(e.target.value)}
                          placeholder="Apto 01, Sala 02..."
                        />
                      </div>
                      <div>
                        <Label>Bairro *</Label>
                        <Input
                          value={deliveryNeighborhood}
                          onChange={(e) => setDeliveryNeighborhood(e.target.value)}
                          placeholder="Nome do bairro"
                        />
                      </div>
                      <div>
                        <Label>Ponto de referência *</Label>
                        <Input
                          value={deliveryReference}
                          onChange={(e) => setDeliveryReference(e.target.value)}
                          placeholder="Próximo ao mercado, em frente à escola..."
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label>Endereço (rua, número, bairro) *</Label>
                        <Input
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Rua, número, bairro"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Cidade *</Label>
                          <Input
                            value={deliveryCity}
                            onChange={(e) => setDeliveryCity(e.target.value)}
                            placeholder="Nome da cidade"
                          />
                        </div>
                        <div>
                          <Label>Estado *</Label>
                          <Select value={deliveryState} onValueChange={setDeliveryState}>
                            <SelectTrigger>
                              <SelectValue placeholder="UF" />
                            </SelectTrigger>
                            <SelectContent>
                              {brazilianStates.map((state) => (
                                <SelectItem key={state} value={state}>
                                  {state}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <Label>Tipo de entrega *</Label>
                    {settings.deliveryMode === 'neighborhood' && getActiveNeighborhoods().length > 0 ? (
                      /* Neighborhood mode */
                      <div className="mt-2 space-y-2">
                        {settings.enablePickup && (
                        <>
                        <div className="flex items-center justify-between p-2 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="pickup-nb"
                              name="deliveryType"
                              checked={deliveryType === 'pickup'}
                              onChange={() => {
                                setDeliveryType('pickup');
                                setSelectedNeighborhood('');
                              }}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="pickup-nb" className="cursor-pointer">Retirada no local</Label>
                          </div>
                          <span className="text-sm text-muted-foreground">Grátis</span>
                        </div>
                        {deliveryType === 'pickup' && company?.address && (
                          <div className="p-3 bg-muted/50 rounded-lg border border-dashed">
                            <p className="text-sm font-medium text-foreground">📍 Endereço para retirada:</p>
                            <p className="text-sm text-muted-foreground mt-1">{company.address}</p>
                          </div>
                        )}
                        </>
                        )}
                        {settings.enableDelivery && (
                        <div className="p-2 border rounded-lg space-y-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="neighborhood"
                              name="deliveryType"
                              checked={deliveryType === 'neighborhood'}
                              onChange={() => setDeliveryType('neighborhood')}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="neighborhood" className="cursor-pointer">Entrega por bairro</Label>
                          </div>
                          {deliveryType === 'neighborhood' && (
                            <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood}>
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Selecione o bairro" />
                              </SelectTrigger>
                              <SelectContent>
                                {getActiveNeighborhoods().map((n) => (
                                  <SelectItem key={n.id} value={n.id}>
                                    {n.neighborhoodName} - R$ {n.deliveryFee.toFixed(2)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        )}
                      </div>
                    ) : (
                      /* Simple mode - City/Interior */
                      <RadioGroup 
                        value={deliveryType} 
                        onValueChange={(value) => setDeliveryType(value as 'pickup' | 'city' | 'interior')} 
                        className="mt-2"
                      >
                        {settings.enablePickup && (
                        <>
                        <div className="flex items-center justify-between p-2 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="pickup" id="pickup" />
                            <Label htmlFor="pickup" className="cursor-pointer">Retirada no local</Label>
                          </div>
                          <span className="text-sm text-muted-foreground">Grátis</span>
                        </div>
                        {deliveryType === 'pickup' && company?.address && (
                          <div className="p-3 bg-muted/50 rounded-lg border border-dashed">
                            <p className="text-sm font-medium text-foreground">📍 Endereço para retirada:</p>
                            <p className="text-sm text-muted-foreground mt-1">{company.address}</p>
                          </div>
                        )}
                        </>
                        )}
                        {settings.enableDelivery && (
                        <>
                        <div className="flex items-center justify-between p-2 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="city" id="city" />
                            <Label htmlFor="city" className="cursor-pointer">Entrega Cidade</Label>
                          </div>
                          <span className="text-sm font-medium text-primary">
                            {settings.deliveryFeeCity > 0 ? `R$ ${settings.deliveryFeeCity.toFixed(2)}` : 'Grátis'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="interior" id="interior" />
                            <Label htmlFor="interior" className="cursor-pointer">Entrega Interior</Label>
                          </div>
                          <span className="text-sm font-medium text-primary">
                            {settings.deliveryFeeInterior > 0 ? `R$ ${settings.deliveryFeeInterior.toFixed(2)}` : 'Grátis'}
                          </span>
                        </div>
                        </>
                        )}
                      </RadioGroup>
                    )}
                  </div>
                  <div>
                    <Label>Forma de pagamento *</Label>
                    <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2">
                      {activePaymentMethods.length > 0 ? (
                        activePaymentMethods.map((method) => (
                          <div key={method.id} className="flex items-center space-x-2">
                            <RadioGroupItem value={method.name} id={`payment-${method.id}`} />
                            <Label htmlFor={`payment-${method.id}`} className="cursor-pointer">{method.name}</Label>
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Pix" id="pix" />
                            <Label htmlFor="pix" className="cursor-pointer">Pix</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Dinheiro" id="dinheiro" />
                            <Label htmlFor="dinheiro" className="cursor-pointer">Dinheiro</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Cartão" id="cartao" />
                            <Label htmlFor="cartao" className="cursor-pointer">Cartão</Label>
                          </div>
                        </>
                      )}
                    </RadioGroup>
                    {/* Show change field when Dinheiro is selected */}
                    {paymentMethod.toLowerCase() === 'dinheiro' && (
                      <div className="mt-3 p-3 bg-accent/50 border border-border rounded-lg">
                        <Label htmlFor="changeFor" className="text-sm font-medium">💵 Troco para quanto?</Label>
                        <Input
                          id="changeFor"
                          placeholder="Ex: 50,00 (deixe vazio se não precisa de troco)"
                          value={changeFor}
                          onChange={(e) => setChangeFor(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    )}
                    {/* Show PIX key when a PIX method is selected */}
                    {paymentMethod && (() => {
                      const selectedPm = activePaymentMethods.find(m => m.name === paymentMethod);
                      if (selectedPm?.pix_key) {
                        return (
                          <div className="mt-3 p-3 bg-accent/50 border border-border rounded-lg">
                            <p className="text-sm font-medium text-foreground">🔑 Chave PIX:</p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-sm font-mono select-all text-muted-foreground break-all flex-1">{selectedPm.pix_key}</p>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(selectedPm.pix_key!);
                                  toast.success('Chave PIX copiada!');
                                }}
                                className="shrink-0 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                              >
                                Copiar
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>R$ {cartTotal.toFixed(2)}</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Taxa de entrega</span>
                      <span>R$ {deliveryFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">R$ {orderTotal.toFixed(2)}</span>
                  </div>
                </div>

                {!canOrder && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Estabelecimento fechado. Pedidos disponíveis apenas durante o horário de funcionamento.
                    </AlertDescription>
                  </Alert>
                )}

                {!isOpen && schedulingEnabled && (
                  <Alert className="mb-3 border-primary/30 bg-primary/5">
                    <Clock className="h-4 w-4 text-primary" />
                    <AlertDescription className="text-foreground">
                      ⏰ Estamos fora do horário, mas você pode deixar seu pedido agendado! Quando abrirmos, ele entrará na fila de produção.
                    </AlertDescription>
                  </Alert>
                )}

                <Button 
                  onClick={sendToWhatsApp} 
                  className="w-full" 
                  size="lg"
                  disabled={!canOrder || isSubmitting}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isSubmitting ? 'Enviando...' : !canOrder ? 'Estabelecimento fechado' : !isOpen ? '⏰ Agendar pedido' : 'Enviar pedido pelo WhatsApp'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
