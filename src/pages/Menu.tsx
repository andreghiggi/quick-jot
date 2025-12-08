import { useState, useEffect } from 'react';
import { useProducts } from '@/hooks/useProducts';
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
import { ShoppingCart, Plus, Minus, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';

const STORE_PHONE_KEY = 'comandatech_store_phone';

export default function Menu() {
  const { products, loading, getActiveProducts, getCategories } = useProducts();
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
  const [storePhone, setStorePhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  const brazilianStates = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  useEffect(() => {
    // Check both keys for backward compatibility
    const newKey = localStorage.getItem(STORE_PHONE_KEY);
    const oldKey = localStorage.getItem('anotaai_store_phone');
    console.log('Menu - STORE_PHONE_KEY:', STORE_PHONE_KEY);
    console.log('Menu - newKey value:', newKey);
    console.log('Menu - oldKey value:', oldKey);
    console.log('Menu - All localStorage keys:', Object.keys(localStorage));
    const savedPhone = newKey || oldKey;
    if (savedPhone) {
      console.log('Menu - Setting storePhone to:', savedPhone);
      setStorePhone(savedPhone);
    } else {
      console.log('Menu - No phone found in localStorage');
    }
  }, []);

  const activeProducts = getActiveProducts();
  const categories = getCategories();

  const groupedProducts = activeProducts.reduce((acc, product) => {
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

  const cartTotal = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function sendToWhatsApp() {
    if (!customerName.trim()) {
      toast.error('Informe seu nome');
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

    let message = `*Novo Pedido - Comanda Tech*\n\n`;
    message += `*Cliente:* ${customerName}\n`;
    if (customerPhone) message += `*Telefone:* ${customerPhone}\n`;
    if (deliveryAddress || deliveryCity || deliveryState) {
      let fullAddress = deliveryAddress;
      if (deliveryCity) fullAddress += ` - ${deliveryCity}`;
      if (deliveryState) fullAddress += `/${deliveryState}`;
      message += `*Endereço:* ${fullAddress}\n`;
    }
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

    message += `\n\n*Total: R$ ${cartTotal.toFixed(2)}*`;

    // Use store phone from URL params or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const phoneFromUrl = urlParams.get('phone');
    const phoneToUse = phoneFromUrl || storePhone;

    if (!phoneToUse) {
      toast.error('Número do WhatsApp da loja não configurado');
      return;
    }

    const cleanPhone = phoneToUse.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phoneWithCountry}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando cardápio...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Cardápio</h1>
            <Button
              variant="outline"
              className="relative"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemsCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {cartItemsCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {categories.map((category) => (
          <div key={category}>
            <h2 className="text-lg font-semibold mb-3">{category}</h2>
            <div className="grid gap-3">
              {groupedProducts[category]?.map((product) => (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setSelectedProduct(product)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      {product.imageUrl && (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium">{product.name}</h3>
                        {product.description && (
                          <p className="text-sm text-muted-foreground">{product.description}</p>
                        )}
                        {product.optionals && product.optionals.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {product.optionals.length} opcionais disponíveis
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-primary font-semibold">
                          R$ {product.price.toFixed(2)}
                        </p>
                        <Button size="sm" className="mt-2">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {activeProducts.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Nenhum produto disponível</p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Product Detail Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              {selectedProduct.imageUrl && (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  className="w-full h-40 object-cover rounded"
                />
              )}
              {selectedProduct.description && (
                <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>
              )}
              <p className="text-lg font-semibold text-primary">
                R$ {selectedProduct.price.toFixed(2)}
              </p>

              {selectedProduct.optionals && selectedProduct.optionals.length > 0 && (
                <div className="space-y-3">
                  <Label>Opcionais</Label>
                  {selectedProduct.optionals
                    .filter((o) => o.active)
                    .map((optional) => (
                      <div
                        key={optional.id}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedOptionals.some((o) => o.id === optional.id)}
                            onCheckedChange={() => toggleOptional(optional)}
                          />
                          <span>{optional.name}</span>
                        </div>
                        {optional.price > 0 && (
                          <span className="text-sm text-muted-foreground">
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
                />
              </div>

              <Button onClick={addToCart} className="w-full">
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
                  <div key={index} className="border rounded p-3">
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
                        <span className="w-8 text-center">{item.quantity}</span>
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
                    <Label>Seu nome *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nome"
                    />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
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

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">R$ {cartTotal.toFixed(2)}</span>
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
        <div className="fixed bottom-4 left-4 right-4">
          <Button
            className="w-full py-6"
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
