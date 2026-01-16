import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useTables, TableStatus } from '@/hooks/useTables';
import { useTabs, Tab } from '@/hooks/useTabs';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Minus,
  Users, 
  Loader2,
  Table as TableIcon,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  ClipboardList
} from 'lucide-react';
import { toast } from 'sonner';

export default function Waiter() {
  const { company, user } = useAuth();
  const { tables, updateTableStatus } = useTables({ companyId: company?.id });
  const { 
    openTabs, 
    loading: loadingTabs, 
    createTab, 
    addItemToTab,
    removeItemFromTab,
    getTabTotal 
  } = useTabs({ companyId: company?.id });
  const { products, loading: loadingProducts } = useProducts({ companyId: company?.id });
  const { categories } = useCategories({ companyId: company?.id });

  const [activeView, setActiveView] = useState<'tables' | 'tabs'>('tables');
  const [selectedTab, setSelectedTab] = useState<Tab | null>(null);
  const [newTabDialogOpen, setNewTabDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [tabNotes, setTabNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    notes: string;
  }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      return matchesSearch && matchesCategory && p.active;
    });
  }, [products, searchTerm, selectedCategory]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-500';
      case 'occupied': return 'bg-red-500';
      case 'reserved': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available': return 'Disponível';
      case 'occupied': return 'Ocupada';
      case 'reserved': return 'Reservada';
      default: return status;
    }
  };

  const handleTableClick = (table: typeof tables[0]) => {
    if (table.status === 'available') {
      // Open new tab for this table
      setSelectedTableId(table.id);
      setNewTabDialogOpen(true);
    } else if (table.status === 'occupied') {
      // Find the tab for this table
      const tab = openTabs.find(t => t.table_id === table.id);
      if (tab) {
        setSelectedTab(tab);
      }
    } else if (table.status === 'reserved') {
      // Ask if want to open or cancel reservation
      setSelectedTableId(table.id);
      setNewTabDialogOpen(true);
    }
  };

  const handleCreateTab = async () => {
    if (!user?.id) return;

    setIsProcessing(true);
    const newTab = await createTab({
      tableId: selectedTableId || undefined,
      customerName: customerName || undefined,
      notes: tabNotes || undefined,
      userId: user.id
    });

    if (newTab) {
      setSelectedTab(newTab);
    }

    setIsProcessing(false);
    setNewTabDialogOpen(false);
    setSelectedTableId('');
    setCustomerName('');
    setTabNotes('');
  };

  const handleAddToCart = (product: typeof products[0]) => {
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        notes: ''
      }]);
    }
  };

  const handleUpdateCartQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.productId === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const handleConfirmItems = async () => {
    if (!selectedTab || !user?.id || cart.length === 0) return;

    setIsProcessing(true);
    for (const item of cart) {
      await addItemToTab(selectedTab.id, {
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
        userId: user.id
      });
    }

    setCart([]);
    setAddItemDialogOpen(false);
    setIsProcessing(false);
    toast.success('Itens adicionados à comanda!');
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  const loading = loadingTabs || loadingProducts;

  if (loading) {
    return (
      <AppLayout title="Garçom">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      title="Garçom"
      actions={
        <Button onClick={() => { setSelectedTableId(''); setNewTabDialogOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Comanda
        </Button>
      }
    >
      <div className="space-y-4">
        {/* View Toggle */}
        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'tables' | 'tabs')}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="tables" className="gap-2">
              <TableIcon className="w-4 h-4" />
              Mesas
            </TabsTrigger>
            <TabsTrigger value="tabs" className="gap-2">
              <Receipt className="w-4 h-4" />
              Comandas ({openTabs.length})
            </TabsTrigger>
          </TabsList>

          {/* Tables View */}
          <TabsContent value="tables" className="mt-4">
            {tables.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <TableIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma mesa configurada</h3>
                  <p className="text-muted-foreground">
                    Configure as mesas no menu Configurações &gt; Mesas
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {tables.map((table) => (
                  <Card 
                    key={table.id} 
                    className={`cursor-pointer hover:shadow-md transition-shadow ${
                      table.status === 'available' ? 'border-green-500/50' :
                      table.status === 'occupied' ? 'border-red-500/50' :
                      'border-yellow-500/50'
                    }`}
                    onClick={() => handleTableClick(table)}
                  >
                    <CardContent className="p-4 text-center">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(table.status)} mx-auto mb-2`} />
                      <p className="text-xl font-bold mb-1">{table.number}</p>
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Users className="w-3 h-3" />
                        {table.capacity}
                      </p>
                      <Badge 
                        variant={table.status === 'available' ? 'default' : 'secondary'} 
                        className="mt-2 text-xs"
                      >
                        {getStatusLabel(table.status)}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tabs View */}
          <TabsContent value="tabs" className="mt-4">
            {openTabs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Receipt className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma comanda aberta</h3>
                  <p className="text-muted-foreground mb-4">
                    Clique em uma mesa disponível ou crie uma nova comanda
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {openTabs.map((tab) => (
                  <Card 
                    key={tab.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedTab(tab)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          Comanda #{tab.tab_number}
                        </CardTitle>
                        {tab.table && (
                          <Badge variant="outline">
                            Mesa {tab.table.number}
                          </Badge>
                        )}
                      </div>
                      {tab.customer_name && (
                        <p className="text-sm text-muted-foreground">{tab.customer_name}</p>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {tab.items?.length || 0} itens
                        </span>
                        <span className="font-bold text-lg">
                          R$ {getTabTotal(tab).toFixed(2)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* New Tab Dialog */}
      <Dialog open={newTabDialogOpen} onOpenChange={setNewTabDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Comanda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mesa (opcional)</Label>
              <Select value={selectedTableId} onValueChange={setSelectedTableId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma mesa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem mesa</SelectItem>
                  {tables.filter(t => t.status === 'available' || t.status === 'reserved').map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      Mesa {table.number} - {getStatusLabel(table.status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nome do cliente (opcional)</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ex: João Silva"
              />
            </div>

            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={tabNotes}
                onChange={(e) => setTabNotes(e.target.value)}
                placeholder="Observações da comanda..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTabDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTab} disabled={isProcessing}>
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Comanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Selected Tab Details */}
      <Dialog open={!!selectedTab} onOpenChange={() => setSelectedTab(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Comanda #{selectedTab?.tab_number}
              </span>
              {selectedTab?.table && (
                <Badge variant="outline">Mesa {selectedTab.table.number}</Badge>
              )}
            </DialogTitle>
            {selectedTab?.customer_name && (
              <p className="text-sm text-muted-foreground">{selectedTab.customer_name}</p>
            )}
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 py-4">
              {/* Items List */}
              {selectedTab?.items && selectedTab.items.length > 0 ? (
                <div className="space-y-2">
                  {selectedTab.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.quantity}x R$ {item.unit_price.toFixed(2)}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground italic">{item.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">R$ {item.total_price.toFixed(2)}</span>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeItemFromTab(item.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum item na comanda
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span>R$ {selectedTab ? getTabTotal(selectedTab).toFixed(2) : '0.00'}</span>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1 gap-2"
                onClick={() => setAddItemDialogOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Adicionar Itens
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Items Dialog */}
      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Adicionar Itens</DialogTitle>
          </DialogHeader>

          <div className="flex gap-4 flex-1 overflow-hidden">
            {/* Products List */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.filter(c => c.active).map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="flex-1">
                <div className="grid grid-cols-2 gap-2 pr-4">
                  {filteredProducts.map((product) => (
                    <Card 
                      key={product.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleAddToCart(product)}
                    >
                      <CardContent className="p-3">
                        <p className="font-medium text-sm truncate">{product.name}</p>
                        <p className="text-sm font-bold text-primary">
                          R$ {product.price.toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Cart */}
            <div className="w-72 border-l pl-4 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart className="w-5 h-5" />
                <h3 className="font-semibold">Carrinho ({cart.length})</h3>
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-4">
                  {cart.map((item) => (
                    <div key={item.productId} className="p-2 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium truncate flex-1">{item.productName}</p>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => handleRemoveFromCart(item.productId)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => handleUpdateCartQuantity(item.productId, -1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-8 text-center text-sm">{item.quantity}</span>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => handleUpdateCartQuantity(item.productId, 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <span className="text-sm font-bold">
                          R$ {(item.quantity * item.unitPrice).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {cart.length > 0 && (
                <div className="border-t pt-4 mt-4 space-y-2">
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>R$ {cartTotal.toFixed(2)}</span>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={handleConfirmItems}
                    disabled={isProcessing}
                  >
                    {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Confirmar Itens
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
