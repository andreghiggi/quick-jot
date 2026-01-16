import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useCashRegister, PdvSaleItem } from '@/hooks/useCashRegister';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Minus, 
  Trash2, 
  DollarSign, 
  ShoppingCart, 
  X,
  Printer,
  CircleDollarSign,
  Lock,
  Unlock,
  Search,
  Package,
  History,
  CreditCard
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CartItem {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export default function PDV() {
  const { user, company } = useAuthContext();
  const { products, loading: productsLoading } = useProducts({ companyId: company?.id });
  const { activePaymentMethods, loading: paymentLoading } = usePaymentMethods({ companyId: company?.id });
  const { 
    currentRegister, 
    registers,
    sales, 
    loading: registerLoading, 
    totalSales,
    salesCount,
    openRegister, 
    closeRegister, 
    reopenRegister,
    addSale,
    deleteSale
  } = useCashRegister({ companyId: company?.id });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');

  // Dialog states
  const [openRegisterDialog, setOpenRegisterDialog] = useState(false);
  const [closeRegisterDialog, setCloseRegisterDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);

  const loading = productsLoading || paymentLoading || registerLoading;

  const activeProducts = products.filter(p => p.active);
  const categories = [...new Set(activeProducts.map(p => p.category))];

  const filteredProducts = activeProducts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const cartTotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const finalTotal = cartTotal - discount;

  function addToCart(product: typeof products[0]) {
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.product_id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.price
      }]);
    }
  }

  function updateQuantity(productId: string | null, delta: number) {
    setCart(cart.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  }

  function removeFromCart(productId: string | null) {
    setCart(cart.filter(item => item.product_id !== productId));
  }

  function clearCart() {
    setCart([]);
    setDiscount(0);
    setCustomerName('');
    setNotes('');
  }

  async function handleOpenRegister() {
    if (!user?.id) return;
    const amount = parseFloat(openingAmount.replace(',', '.')) || 0;
    const success = await openRegister(amount, user.id);
    if (success) {
      setOpenRegisterDialog(false);
      setOpeningAmount('');
    }
  }

  async function handleCloseRegister() {
    if (!user?.id) return;
    const amount = parseFloat(closingAmount.replace(',', '.')) || 0;
    const result = await closeRegister(amount, user.id, closingNotes || undefined);
    if (result) {
      setCloseRegisterDialog(false);
      setClosingAmount('');
      setClosingNotes('');
      // Optional: print summary
      printClosingSummary(result);
    }
  }

  async function handleReopenRegister(registerId: string) {
    await reopenRegister(registerId);
    setHistoryDialog(false);
  }

  function openPaymentDialog() {
    if (cart.length === 0) {
      toast.error('Adicione produtos ao carrinho');
      return;
    }
    if (activePaymentMethods.length === 0) {
      toast.error('Configure formas de pagamento primeiro');
      return;
    }
    setSelectedPaymentMethod(activePaymentMethods[0].id);
    setPaymentDialog(true);
  }

  async function handleFinalizeSale() {
    if (!user?.id || !selectedPaymentMethod) return;
    
    const success = await addSale(
      cart,
      selectedPaymentMethod,
      user.id,
      discount,
      customerName || undefined,
      notes || undefined
    );

    if (success) {
      setPaymentDialog(false);
      clearCart();
    }
  }

  function printClosingSummary(register: typeof currentRegister) {
    if (!register) return;

    const salesByMethod = sales.reduce((acc, sale) => {
      const methodName = sale.payment_method?.name || 'Não informado';
      acc[methodName] = (acc[methodName] || 0) + sale.final_total;
      return acc;
    }, {} as Record<string, number>);

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page { margin: 0; size: 80mm auto; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            width: 80mm;
            margin: 0;
            padding: 4mm;
            box-sizing: border-box;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          h2 { margin: 4px 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="center bold">
          <h2>FECHAMENTO DE CAIXA</h2>
          <p>${company?.name || 'PDV'}</p>
        </div>
        <div class="line"></div>
        <div class="row"><span>Abertura:</span><span>${format(new Date(register.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span></div>
        <div class="row"><span>Fechamento:</span><span>${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span></div>
        <div class="line"></div>
        <div class="row"><span>Valor Inicial:</span><span>R$ ${register.opening_amount.toFixed(2)}</span></div>
        <div class="row"><span>Total Vendas:</span><span>R$ ${totalSales.toFixed(2)}</span></div>
        <div class="row"><span>Qtd. Vendas:</span><span>${salesCount}</span></div>
        <div class="line"></div>
        <div class="bold">Vendas por Forma de Pagamento:</div>
        ${Object.entries(salesByMethod).map(([method, total]) => 
          `<div class="row"><span>${method}:</span><span>R$ ${total.toFixed(2)}</span></div>`
        ).join('')}
        <div class="line"></div>
        <div class="row bold"><span>Valor Esperado:</span><span>R$ ${((register.opening_amount || 0) + totalSales).toFixed(2)}</span></div>
        <div class="row bold"><span>Valor Informado:</span><span>R$ ${register.closing_amount?.toFixed(2) || '0.00'}</span></div>
        <div class="row bold"><span>Diferença:</span><span>R$ ${register.difference?.toFixed(2) || '0.00'}</span></div>
        ${register.notes ? `<div class="line"></div><p>Obs: ${register.notes}</p>` : ''}
        <div class="line"></div>
        <div class="center" style="margin-top: 8px;">
          <p style="font-size: 10px;">Impresso em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };
    }
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  if (loading) {
    return (
      <AppLayout title="PDV">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  // No register open - show open dialog
  if (!currentRegister) {
    return (
      <AppLayout title="PDV - Ponto de Venda">
        <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
          <div className="text-center space-y-2">
            <Lock className="w-16 h-16 mx-auto text-muted-foreground" />
            <h2 className="text-2xl font-bold">Caixa Fechado</h2>
            <p className="text-muted-foreground">Abra o caixa para iniciar as vendas</p>
          </div>
          
          <div className="flex gap-4">
            <Button size="lg" onClick={() => setOpenRegisterDialog(true)} className="gap-2">
              <Unlock className="w-5 h-5" />
              Abrir Caixa
            </Button>
            <Button size="lg" variant="outline" onClick={() => setHistoryDialog(true)} className="gap-2">
              <History className="w-5 h-5" />
              Histórico
            </Button>
          </div>
        </div>

        {/* Open Register Dialog */}
        <Dialog open={openRegisterDialog} onOpenChange={setOpenRegisterDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abrir Caixa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Valor Inicial (Troco)</Label>
                <Input
                  type="text"
                  placeholder="0,00"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenRegisterDialog(false)}>Cancelar</Button>
              <Button onClick={handleOpenRegister}>Abrir Caixa</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Histórico de Caixas</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3">
                {registers.map((reg) => (
                  <Card key={reg.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">
                            {format(new Date(reg.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {reg.status === 'open' ? 'Aberto' : 
                              `Fechado em ${format(new Date(reg.closed_at!), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                            }
                          </p>
                          <p className="text-sm">
                            Inicial: {formatCurrency(reg.opening_amount)}
                            {reg.status === 'closed' && (
                              <> | Final: {formatCurrency(reg.closing_amount || 0)}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={reg.status === 'open' ? 'default' : 'secondary'}>
                            {reg.status === 'open' ? 'Aberto' : 'Fechado'}
                          </Badge>
                          {reg.status === 'closed' && (
                            <Button size="sm" variant="outline" onClick={() => handleReopenRegister(reg.id)}>
                              Reabrir
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {registers.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">Nenhum histórico encontrado</p>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="PDV - Ponto de Venda">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-8rem)]">
        {/* Products Section */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Search and Categories */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <Button
                variant={selectedCategory === null ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                Todos
              </Button>
              {categories.map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pr-4">
              {filteredProducts.map(product => (
                <Card 
                  key={product.id} 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => addToCart(product)}
                >
                  <CardContent className="p-3">
                    {product.imageUrl ? (
                      <img 
                        src={product.imageUrl} 
                        alt={product.name}
                        className="w-full h-20 object-cover rounded-md mb-2"
                      />
                    ) : (
                      <div className="w-full h-20 bg-muted rounded-md mb-2 flex items-center justify-center">
                        <Package className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <p className="text-primary font-bold text-sm">
                      {formatCurrency(product.price)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Cart Section */}
        <div className="flex flex-col gap-4">
          {/* Cash Register Info */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="w-5 h-5 text-primary" />
                  <span className="font-medium">Caixa Aberto</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {salesCount} vendas | {formatCurrency(totalSales)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setHistoryDialog(true)}>
                    <History className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setCloseRegisterDialog(true)}>
                    <Lock className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cart */}
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Carrinho
                </CardTitle>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearCart}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ScrollArea className="flex-1 -mx-4 px-4">
                {cart.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    Carrinho vazio
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cart.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.unit_price)} x {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Button 
                              size="icon" 
                              variant="outline" 
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.product_id, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center text-sm">{item.quantity}</span>
                            <Button 
                              size="icon" 
                              variant="outline" 
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.product_id, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <p className="font-medium text-sm w-20 text-right">
                            {formatCurrency(item.unit_price * item.quantity)}
                          </p>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeFromCart(item.product_id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {cart.length > 0 && (
                <>
                  <Separator className="my-4" />
                  
                  {/* Discount */}
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-sm">Desconto:</Label>
                    <Input
                      type="number"
                      placeholder="0,00"
                      value={discount || ''}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className="h-8 w-24"
                    />
                  </div>

                  {/* Customer Name */}
                  <div className="flex items-center gap-2 mb-4">
                    <Label className="text-sm">Cliente:</Label>
                    <Input
                      placeholder="Nome (opcional)"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="h-8 flex-1"
                    />
                  </div>

                  {/* Totals */}
                  <div className="space-y-1 mb-4">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(cartTotal)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm text-destructive">
                        <span>Desconto:</span>
                        <span>-{formatCurrency(discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total:</span>
                      <span className="text-primary">{formatCurrency(finalTotal)}</span>
                    </div>
                  </div>

                  <Button className="w-full gap-2" size="lg" onClick={openPaymentDialog}>
                    <DollarSign className="w-5 h-5" />
                    Finalizar Venda
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forma de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {activePaymentMethods.map(method => (
                <Button
                  key={method.id}
                  variant={selectedPaymentMethod === method.id ? 'default' : 'outline'}
                  className="h-16 gap-2"
                  onClick={() => setSelectedPaymentMethod(method.id)}
                >
                  <CreditCard className="w-5 h-5" />
                  {method.name}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações da venda..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <div className="flex justify-between text-lg font-bold">
                <span>Total a Pagar:</span>
                <span className="text-primary">{formatCurrency(finalTotal)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancelar</Button>
            <Button onClick={handleFinalizeSale} disabled={!selectedPaymentMethod}>
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Register Dialog */}
      <Dialog open={closeRegisterDialog} onOpenChange={setCloseRegisterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar Caixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span>Valor Inicial:</span>
                <span>{formatCurrency(currentRegister?.opening_amount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total de Vendas:</span>
                <span>{formatCurrency(totalSales)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Valor Esperado:</span>
                <span className="text-primary">
                  {formatCurrency((currentRegister?.opening_amount || 0) + totalSales)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Valor em Caixa</Label>
              <Input
                type="text"
                placeholder="0,00"
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações do fechamento..."
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseRegisterDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleCloseRegister}>
              <Printer className="w-4 h-4 mr-2" />
              Fechar e Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de Caixas</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3">
              {registers.map((reg) => (
                <Card key={reg.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {format(new Date(reg.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {reg.status === 'open' ? 'Aberto' : 
                            `Fechado em ${format(new Date(reg.closed_at!), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                          }
                        </p>
                        <p className="text-sm">
                          Inicial: {formatCurrency(reg.opening_amount)}
                          {reg.status === 'closed' && (
                            <> | Final: {formatCurrency(reg.closing_amount || 0)}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={reg.status === 'open' ? 'default' : 'secondary'}>
                          {reg.status === 'open' ? 'Aberto' : 'Fechado'}
                        </Badge>
                        {reg.status === 'closed' && !currentRegister && (
                          <Button size="sm" variant="outline" onClick={() => handleReopenRegister(reg.id)}>
                            Reabrir
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {registers.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum histórico encontrado</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
