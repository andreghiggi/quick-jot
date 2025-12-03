import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { defaultProducts, categories } from '@/data/products';
import { useOrderStore } from '@/stores/orderStore';
import { Order, OrderItem, Product } from '@/types/order';
import { Plus, Minus, ShoppingBag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CartItem extends Product {
  quantity: number;
}

export function NewOrderDialog({ open, onOpenChange }: NewOrderDialogProps) {
  const { addOrder } = useOrderStore();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(categories[0]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === productId);
      if (existing && existing.quantity > 1) {
        return prev.map((item) =>
          item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        );
      }
      return prev.filter((item) => item.id !== productId);
    });
  }

  function getCartQuantity(productId: string): number {
    return cart.find((item) => item.id === productId)?.quantity || 0;
  }

  function handleSubmit() {
    if (!customerName.trim()) {
      toast.error('Informe o nome do cliente');
      return;
    }
    if (cart.length === 0) {
      toast.error('Adicione pelo menos um item ao pedido');
      return;
    }

    const orderItems: OrderItem[] = cart.map((item) => ({
      id: crypto.randomUUID(),
      productId: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    }));

    const order: Order = {
      id: crypto.randomUUID(),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      notes: notes.trim() || undefined,
      items: orderItems,
      total,
      status: 'pending',
      createdAt: new Date(),
    };

    addOrder(order);
    toast.success('Pedido criado com sucesso!');
    resetForm();
    onOpenChange(false);
  }

  function resetForm() {
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setNotes('');
    setCart([]);
    setSelectedCategory(categories[0]);
  }

  const filteredProducts = defaultProducts.filter((p) => p.category === selectedCategory);

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
              <Input
                id="customerName"
                placeholder="Nome do cliente"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Telefone</Label>
              <Input
                id="customerPhone"
                placeholder="(00) 00000-0000"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliveryAddress">Endereço de entrega</Label>
            <Input
              id="deliveryAddress"
              placeholder="Rua, número, bairro..."
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
            />
          </div>

          {/* Products */}
          <div className="space-y-3">
            <Label>Produtos</Label>
            <div className="flex gap-2 flex-wrap">
              {categories.map((category) => (
                <Badge
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-all',
                    selectedCategory === category && 'shadow-primary'
                  )}
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
                      "p-3 rounded-lg border border-border bg-card",
                      "hover:border-primary/50 transition-colors",
                      quantity > 0 && "border-primary bg-accent"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm text-foreground">{product.name}</p>
                        <p className="text-primary font-semibold">
                          R$ {product.price.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {quantity > 0 && (
                        <>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => removeFromCart(product.id)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-6 text-center font-semibold">{quantity}</span>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant={quantity > 0 ? 'default' : 'outline'}
                        className="h-7 w-7"
                        onClick={() => addToCart(product)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cart Summary */}
          {cart.length > 0 && (
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <span className="font-semibold">Resumo do pedido</span>
              </div>
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCart((prev) => prev.filter((i) => i.id !== item.id))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <span>{item.quantity}x {item.name}</span>
                  </div>
                  <span className="text-muted-foreground">
                    R$ {(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary">R$ {total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              placeholder="Observações do pedido..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-border mt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSubmit}>
            Criar Pedido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
