import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProducts } from '@/hooks/useProducts';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useCategories } from '@/hooks/useCategories';
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
import { ShoppingCart, Plus, Minus, Trash2, Send, CheckCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Company {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
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
          .select('id, name, slug, phone')
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

  const { products, loading: productsLoading, getActiveProducts } = useProducts({ companyId: company?.id });
  const { settings, loading: settingsLoading } = useStoreSettings({ companyId: company?.id });
  const { categories, loading: categoriesLoading } = useCategories({ companyId: company?.id });
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOptionals, setSelectedOptionals] = useState<ProductOptional[]>([]);
  const [itemNotes, setItemNotes] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'city' | 'interior' | ''>('');
  const [orderSent, setOrderSent] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerLoaded, setCustomerLoaded] = useState(false);

  const brazilianStates = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  const loading = companyLoading || productsLoading || settingsLoading || categoriesLoading;

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
          if (data.address && !deliveryAddress) setDeliveryAddress(data.address);
          if (data.city && !deliveryCity) setDeliveryCity(data.city);
          if (data.state && !deliveryState) setDeliveryState(data.state);
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
  
  // Get unique categories from products
  const productCategories = [...new Set(activeProducts.map((p) => p.category))];
  
  // Filter products based on selected category and search
  const filteredProducts = activeProducts.filter((product) => {
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const groupedProducts = filteredProducts.reduce((acc, product) => {
    if (!acc[product.category]) acc[product.category] = [];
    acc[product.category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  function toggleOptional(optional: ProductOptional) {
    setSelectedOptionals((prev) =>
      prev.find((o) => o.id === optional.id)
        ? prev.filter((o) => o.id !== optional.id)
        : [...prev, optional]
    );
  }

  function addToCart() {
    if (!selectedProduct) return;

    const newItem: CartItem = {
      product: selectedProduct,
      quantity: 1,
      selectedOptionals,
      notes: itemNotes || undefined,
    };

    setCart((prev) => [...prev, newItem]);
    setSelectedProduct(null);
    setSelectedOptionals([]);
    setItemNotes('');
    toast.success('Adicionado ao carrinho!', { duration: 1500 });
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
    if (deliveryType === 'city') return settings.deliveryFeeCity || 0;
    if (deliveryType === 'interior') return settings.deliveryFeeInterior || 0;
    return 0;
  };

  const deliveryFee = getDeliveryFee();
  const cartTotal = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const orderTotal = cartTotal + deliveryFee;

  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  async function sendToWhatsApp() {
    if (!customerName.trim()) {
      toast.error('Informe seu nome');
      return;
    }
    if (!deliveryType) {
      toast.error('Selecione o tipo de entrega');
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

    // Build full address
    let fullAddress = deliveryAddress;
    if (deliveryCity) fullAddress += ` - ${deliveryCity}`;
    if (deliveryState) fullAddress += `/${deliveryState}`;

    // Get delivery type label
    const deliveryTypeLabel = deliveryType === 'pickup' ? 'Retirada' : deliveryType === 'city' ? 'Entrega Cidade' : 'Entrega Interior';

    // Save order to database
    try {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: customerName,
          customer_phone: customerPhone || null,
          delivery_address: fullAddress || null,
          notes: `Pagamento: ${paymentMethod} | ${deliveryTypeLabel}${deliveryFee > 0 ? ` (R$ ${deliveryFee.toFixed(2)})` : ''}`,
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
                address: deliveryAddress || null,
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
    } catch (error) {
      console.error('Error saving order to database:', error);
    }

    // Build WhatsApp message
    const storeName = settings.storeName || company?.name || 'Comanda Tech';
    let message = `*Novo Pedido - ${storeName}*\n\n`;
    message += `*Cliente:* ${customerName}\n`;
    if (customerPhone) message += `*Telefone:* ${customerPhone}\n`;
    if (fullAddress) message += `*Endereço:* ${fullAddress}\n`;
    message += `*Tipo:* ${deliveryTypeLabel}\n`;
    message += `*Pagamento:* ${paymentMethod}\n`;
    message += `\n*Itens:*\n`;

    cart.forEach((item, index) => {
      message += `\n${index + 1}. ${item.product.name} x${item.quantity}`;
      if (item.selectedOptionals.length > 0) {
        message += `\n   Adicionais: ${item.selectedOptionals.map((o) => o.name).join(', ')}`;
      }
      if (item.notes) {
        message += `\n   Obs: ${item.notes}`;
      }
      message += `\n   R$ ${calculateItemTotal(item).toFixed(2)}`;
    });

    message += `\n\n*Subtotal: R$ ${cartTotal.toFixed(2)}*`;
    if (deliveryFee > 0) {
      message += `\n*Taxa de entrega: R$ ${deliveryFee.toFixed(2)}*`;
    }
    message += `\n*TOTAL: R$ ${orderTotal.toFixed(2)}*`;

    const cleanPhone = phoneToUse.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const encodedMessage = encodeURIComponent(message);
    const generatedWhatsappUrl = `https://wa.me/${phoneWithCountry}?text=${encodedMessage}`;

    // Clear cart and show success screen
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setDeliveryCity('');
    setDeliveryState('');
    setDeliveryType('');
    setPaymentMethod('');
    setPaymentMethod('');
    setWhatsappUrl(generatedWhatsappUrl);
    setOrderSent(true);
    setIsCartOpen(false);

    // Open WhatsApp
    window.open(generatedWhatsappUrl, '_blank');
  }

  function resetOrder() {
    setOrderSent(false);
    setWhatsappUrl('');
  }

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

  // Show order sent confirmation screen
  if (orderSent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center space-y-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Pedido Enviado!</h2>
              <p className="text-muted-foreground">
                Seu pedido foi registrado. Clique no botão abaixo se o WhatsApp não abriu automaticamente.
              </p>
            </div>
            <div className="space-y-3">
              <Button 
                className="w-full" 
                size="lg"
                onClick={() => window.open(whatsappUrl, '_blank')}
              >
                <Send className="h-4 w-4 mr-2" />
                Abrir WhatsApp
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={resetOrder}
              >
                Fazer novo pedido
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Fixed Header Container - Banner scrolls away, but name/search/categories stay */}
      <div className="sticky top-0 z-20">
        {/* Store Name + Cart + Search + Categories - Always visible */}
        <div className="bg-card border-b border-border shadow-sm">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              {/* Left side: Store name */}
              <h1 className="text-lg font-bold text-foreground flex-shrink-0">
                {settings.storeName || company?.name || 'Cardápio'}
              </h1>
              
              {/* Center: Category Pills */}
              <ScrollArea className="flex-1 mx-2">
                <div className="flex gap-1.5">
                  <Button
                    variant={!selectedCategory ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-full whitespace-nowrap h-7 px-3 text-xs"
                    onClick={() => setSelectedCategory(null)}
                  >
                    Todos
                  </Button>
                  {productCategories.map((category) => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? 'default' : 'outline'}
                      size="sm"
                      className="rounded-full whitespace-nowrap h-7 px-3 text-xs"
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
              
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

      {/* Banner - Scrolls with content */}
      {settings.bannerUrl && (
        <div className="w-full h-40 overflow-hidden">
          <img 
            src={settings.bannerUrl} 
            alt="Banner" 
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Products Grid */}
      <main className="container mx-auto px-4 py-6 space-y-8">
        {Object.entries(groupedProducts).map(([category, categoryProducts]) => (
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

      {/* Product Detail Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              {selectedProduct.imageUrl && (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  className="w-full h-48 object-cover rounded-lg"
                />
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

              <div>
                <Label>Observações (opcional)</Label>
                <Input
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="Ex: Sem cebola, bem passado..."
                  className="mt-2"
                />
              </div>

              <Button onClick={addToCart} className="w-full" size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar ao carrinho
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cart Dialog */}
      <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seu Pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Carrinho vazio</p>
            ) : (
              <>
                {cart.map((item, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{item.product.name}</p>
                        {item.selectedOptionals.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            + {item.selectedOptionals.map((o) => o.name).join(', ')}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-muted-foreground">Obs: {item.notes}</p>
                        )}
                      </div>
                      <p className="font-semibold">R$ {calculateItemTotal(item).toFixed(2)}</p>
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
                    <Label>Telefone</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div>
                    <Label>Seu nome *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nome"
                    />
                  </div>
                  <div>
                    <Label>Endereço (rua, número, bairro)</Label>
                    <Input
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Rua, número, bairro"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Cidade</Label>
                      <Input
                        value={deliveryCity}
                        onChange={(e) => setDeliveryCity(e.target.value)}
                        placeholder="Nome da cidade"
                      />
                    </div>
                    <div>
                      <Label>Estado</Label>
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
                  <div>
                    <Label>Tipo de entrega *</Label>
                    <RadioGroup 
                      value={deliveryType} 
                      onValueChange={(value) => setDeliveryType(value as 'pickup' | 'city' | 'interior')} 
                      className="mt-2"
                    >
                      <div className="flex items-center justify-between p-2 border rounded-lg">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="pickup" id="pickup" />
                          <Label htmlFor="pickup" className="cursor-pointer">Retirada no local</Label>
                        </div>
                        <span className="text-sm text-muted-foreground">Grátis</span>
                      </div>
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
                    </RadioGroup>
                  </div>
                  <div>
                    <Label>Forma de pagamento *</Label>
                    <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2">
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
                    </RadioGroup>
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

                <Button onClick={sendToWhatsApp} className="w-full" size="lg">
                  <Send className="h-4 w-4 mr-2" />
                  Enviar pedido pelo WhatsApp
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating cart button */}
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
  );
}
