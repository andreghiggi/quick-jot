import { useState, useMemo, useEffect, useCallback } from 'react';
import { ShoppingCart, Search, X, Loader2, Plus, Minus, CreditCard, Banknote, QrCode, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useProducts } from '@/hooks/useProducts';
import { useScale } from '@/hooks/useScale';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { brl as formatPrice } from '@/components/pdv-v2/_format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useOrders } from '@/hooks/useOrders';
import { useCashRegister } from '@/hooks/useCashRegister';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';

interface Props {
  companyId: string;
}

export function PDVV2FastCheckout({ companyId }: Props) {
  const { products, loading: productsLoading } = useProducts({ companyId });
  const { settings: storeSettings } = useStoreSettings({ companyId });
  const { getWeight, reading: readingScale } = useScale();
  const { currentRegister, addSale } = useCashRegister({ companyId });
  const { addOrder } = useOrders({ companyId });
  const { user } = useAuthContext();
  const { activePaymentMethods: pdvPaymentMethods } = usePaymentMethods({ companyId, channel: 'pdv' });
  
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeProducts = useMemo(
    () => products.filter((p) => p.active && p.pdvItem !== false),
    [products]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return activeProducts
      .filter((p) => p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q)))
      .slice(0, 10);
  }, [activeProducts, query]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0), [cart]);

  async function handleAddProduct(p: any) {
    let weight: number | null = null;
    const isScaleItem = p.unit?.toLowerCase() === 'kg' || p.sellByWeight;

    if (isScaleItem && storeSettings.scaleEnabled) {
      weight = await getWeight();
      if (weight === null || weight <= 0) {
        toast.error('Não foi possível ler o peso da balança');
        return;
      }
    }

    const quantity = weight ?? 1;
    const newItem = {
      id: crypto.randomUUID(),
      product_id: p.id,
      product_name: p.name + (weight ? ` [PESO: ${weight.toFixed(3)}kg]` : ''),
      quantity,
      unit_price: p.price,
    };

    setCart(prev => [...prev, newItem]);
    setQuery('');
    toast.success(`${p.name} adicionado`);
  }

  function updateQty(id: string, delta: number) {
    setCart(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
    ).filter(item => item.quantity > 0));
  }

  async function handleFinish(methodName: string) {
    if (cart.length === 0) return;
    if (!currentRegister) {
      toast.error('Abra o caixa antes de vender');
      return;
    }
    if (!user) return;

    setIsSubmitting(true);
    try {
      // 1. Encontrar o ID da forma de pagamento pelo nome (aproximado)
      const method = pdvPaymentMethods.find(m => m.name.toLowerCase().includes(methodName.toLowerCase()));
      if (!method) {
        toast.error(`Forma de pagamento "${methodName}" não encontrada no PDV`);
        return;
      }

      // 2. Registrar a venda no caixa (pdv_sales)
      const saleData = {
        company_id: companyId,
        cash_register_id: currentRegister.id,
        payment_method_id: method.id,
        total: subtotal,
        discount: 0,
        final_total: subtotal,
        notes: '[VENDA RÁPIDA]',
        created_by: user.id,
      };

      const { data: sale, error: saleError } = await supabase
        .from('pdv_sales')
        .insert(saleData as any)
        .select()
        .single();

      if (saleError) throw saleError;

      // 3. Registrar itens da venda
      const saleItems = cart.map(item => ({
        sale_id: sale.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
      }));

      const { error: itemsError } = await supabase.from('pdv_sale_items').insert(saleItems);
      if (itemsError) throw itemsError;

      // 4. Criar o pedido (opcional, mas bom para histórico unificado)
      await addOrder({
        customerName: 'Cliente Balcão',
        total: subtotal,
        status: 'delivered',
        origin: 'balcao',
        items: cart.map(it => ({
          id: crypto.randomUUID(),
          productId: it.product_id,
          name: it.product_name,
          quantity: it.quantity,
          price: it.unit_price,
        })),
        notes: `[EXPRESS] [COBRADO] [VENDA RÁPIDA] Pagamento: ${method.name}`,
      });

      setCart([]);
      toast.success('Venda rápida finalizada!');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao finalizar venda');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="h-full flex flex-col border-l rounded-none shadow-none bg-muted/10">
      <CardContent className="p-4 flex flex-col h-full space-y-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-lg">Venda Rápida</h2>
          {readingScale && <Badge variant="secondary" className="animate-pulse">Lendo Balança...</Badge>}
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar ou Bipar..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg">
              <ScrollArea className="max-h-60">
                {filtered.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between items-center"
                    onClick={() => handleAddProduct(p)}
                  >
                    <span>{p.name}</span>
                    <span className="font-bold">{formatPrice(p.price)}</span>
                  </button>
                ))}
              </ScrollArea>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="space-y-2">
            {cart.map(item => (
              <div key={item.id} className="bg-background border rounded-lg p-2 text-sm">
                <div className="font-medium truncate">{item.product_name}</div>
                <div className="flex justify-between items-center mt-1">
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-8 text-center tabular-nums">{item.quantity.toFixed(item.quantity % 1 === 0 ? 0 : 3)}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <div className="font-bold text-green-600">{formatPrice(item.unit_price * item.quantity)}</div>
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm italic">
                Carrinho vazio
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="pt-4 border-t space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-muted-foreground text-sm font-medium">TOTAL</span>
            <span className="text-2xl font-black text-primary">{formatPrice(subtotal)}</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {pdvPaymentMethods.map((method) => {
              const nameLower = method.name.toLowerCase();
              const Icon = nameLower.includes('pix') ? QrCode : 
                          (nameLower.includes('cartao') || nameLower.includes('cartão') || nameLower.includes('tef')) ? CreditCard : 
                          (nameLower.includes('dinheiro') || nameLower.includes('especie')) ? Banknote : Wallet;
              
              const isCash = nameLower.includes('dinheiro') || nameLower.includes('especie');
              
              return (
                <Button
                  key={method.id}
                  className={cn(
                    "h-12 text-xs font-bold w-full justify-start px-4",
                    isCash ? "bg-green-600 hover:bg-green-700 text-white" : ""
                  )}
                  variant={isCash ? "default" : "secondary"}
                  disabled={cart.length === 0 || isSubmitting}
                  onClick={() => handleFinish(method.name)}
                >
                  <Icon className="w-4 h-4 mr-3" />
                  {method.name.toUpperCase()}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
