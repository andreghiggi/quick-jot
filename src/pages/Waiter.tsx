import { useState, useMemo, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useTables, TableStatus } from '@/hooks/useTables';
import { useTabs, Tab } from '@/hooks/useTabs';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useOptionalGroups, OptionalGroup } from '@/hooks/useOptionalGroups';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { PDVOptionalsDialog } from '@/components/pdv/PDVOptionalsDialog';
import { PDVV2CategoryBrowser } from '@/components/pdv-v2/PDVV2CategoryBrowser';
import { LANCHERIA_I9_COMPANY_ID } from '@/components/pdv-v2/_format';
import { supabase } from '@/integrations/supabase/client';
import { generateProductionTicketHTML } from '@/utils/printProductionTicket';
import { computeReadyOffsetMinutes } from '@/utils/estimatedReadyOffset';
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
  ClipboardList,
  Printer,
  ChevronUp,
  ChevronDown,
  Pencil,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';

export default function Waiter() {
  const { company, user } = useAuthContext();
  const { tables, updateTableStatus } = useTables({ companyId: company?.id });
  const { 
    openTabs, 
    loading: loadingTabs, 
    createTab, 
    addMultipleItemsToTab,
    removeItemFromTab,
    getTabTotal 
  } = useTabs({ companyId: company?.id });
  const { products, loading: loadingProducts } = useProducts({ companyId: company?.id });
  const { categories } = useCategories({ companyId: company?.id });
  const { groups: optionalGroups } = useOptionalGroups({ companyId: company?.id });
  const { settings: storeSettings } = useStoreSettings({ companyId: company?.id });

  const [activeView, setActiveView] = useState<'tables' | 'tabs'>('tables');
  const [selectedTab, setSelectedTab] = useState<Tab | null>(null);
  const [newTabDialogOpen, setNewTabDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [manualTabNumber, setManualTabNumber] = useState('');
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
  const [optionalsDialogProduct, setOptionalsDialogProduct] = useState<typeof products[0] | null>(null);
  const [optionalsDialogGroups, setOptionalsDialogGroups] = useState<OptionalGroup[]>([]);
  const cartEndRef = useRef<HTMLDivElement>(null);

  const isI9 = company?.id === LANCHERIA_I9_COMPANY_ID;

  // i9: animated badge counter
  const [cartBounce, setCartBounce] = useState(false);
  const prevCartLength = useRef(cart.length);

  useEffect(() => {
    if (isI9 && cart.length > prevCartLength.current) {
      setCartBounce(true);
      const t = setTimeout(() => setCartBounce(false), 300);
      return () => clearTimeout(t);
    }
    prevCartLength.current = cart.length;
  }, [cart.length, isI9]);

  // i9: collapsible cart
  const [cartCollapsed, setCartCollapsed] = useState(true);

  // i9: expand notes per item
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Auto-scroll cart to show the last added item
  useEffect(() => {
    if (cart.length > 0 && cartEndRef.current) {
      cartEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [cart.length]);

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
      userId: user.id,
      manualTabNumber: manualTabNumber ? parseInt(manualTabNumber) : undefined
    });

    if (newTab) {
      setSelectedTab(newTab);
    }

    setIsProcessing(false);
    setNewTabDialogOpen(false);
    setSelectedTableId('');
    setCustomerName('');
    setManualTabNumber('');
    setTabNotes('');
  };

  // Build category name→id map for optional group matching
  const categoryIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { map[c.name] = c.id; });
    return map;
  }, [categories]);

  const handleAddToCart = (product: typeof products[0]) => {
    // Check if product has optional groups (match by product ID or category ID)
    const catId = categoryIdByName[product.category];
    const productGroups = optionalGroups.filter(g => 
      g.active && (g.productIds.includes(product.id) || (catId && g.categoryIds.includes(catId)))
    );
    
    if (productGroups.length > 0) {
      setOptionalsDialogProduct(product);
      setOptionalsDialogGroups(productGroups);
      return;
    }

    addSimpleToCart(product.id, product.name, product.price);
  };

  const addSimpleToCart = (productId: string, productName: string, unitPrice: number) => {
    const existing = cart.find(item => item.productId === productId && item.productName === productName);
    if (existing) {
      setCart(cart.map(item => 
        item.productId === productId && item.productName === productName
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        productId,
        productName,
        quantity: 1,
        unitPrice,
        notes: ''
      }]);
    }
  };

  const handleOptionalsAddToCart = (items: Array<{
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
  }>) => {
    for (const item of items) {
      setCart(prev => [...prev, {
        productId: item.product_id || '',
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        notes: ''
      }]);
    }
    setOptionalsDialogProduct(null);
    setOptionalsDialogGroups([]);
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

  const handleUpdateCartNotes = (productId: string, notes: string) => {
    setCart(cart.map(item => 
      item.productId === productId ? { ...item, notes } : item
    ));
  };

  const handleConfirmItems = async (shouldPrint: boolean = false) => {
    if (!selectedTab || !user?.id || cart.length === 0) {
      toast.error('Selecione uma comanda primeiro');
      return;
    }

    setIsProcessing(true);
    try {
      const itemsToAdd = cart.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
        userId: user.id
      }));

      await addMultipleItemsToTab(selectedTab.id, itemsToAdd);

      if (shouldPrint && company?.id) {
        // Send to print queue for auto_printer.py on computer
        const html = generateProductionTicketHTML({
          tabNumber: selectedTab.tab_number,
          tableNumber: selectedTab.table?.number,
          customerName: selectedTab.customer_name,
          items: cart.map(item => ({
            productName: item.productName,
            quantity: item.quantity,
            notes: item.notes
          })),
          createdAt: new Date(),
          paperSize: storeSettings.printerPaperSize,
          layout: storeSettings.printLayout,
          // Lancheria I9: previsão = criação + (máximo do "Prazo estimado de entrega" − 10 min).
          showReadyTime: company?.id === '8c9e7a0e-dbb6-49b9-8344-c23155a71164',
          readyOffsetMinutes:
            company?.id === '8c9e7a0e-dbb6-49b9-8344-c23155a71164'
              ? computeReadyOffsetMinutes(storeSettings.estimatedWaitTime, 30)
              : undefined,
        });
        
        const { error: printError } = await supabase
          .from('print_queue')
          .insert({
            company_id: company.id,
            html_content: html,
            label: `Comanda #${selectedTab.tab_number}`,
          });
        
        if (printError) {
          console.error('Print queue error:', printError);
          toast.error('Erro ao enviar para impressão');
        } else {
          toast.success(`Pedido enviado para impressão!`);
        }
      } else {
        toast.success(`Itens adicionados à Comanda #${selectedTab.tab_number}!`);
      }

      setCart([]);
      setAddItemDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao adicionar itens');
    } finally {
      setIsProcessing(false);
    }
  };

  // Keep selectedTab in sync with openTabs
  useEffect(() => {
    if (selectedTab) {
      const updatedTab = openTabs.find(t => t.id === selectedTab.id);
      if (updatedTab) {
        setSelectedTab(updatedTab);
      }
    }
  }, [openTabs]);

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
              <Label>Nº da Comanda (opcional)</Label>
              <Input
                type="number"
                value={manualTabNumber}
                onChange={(e) => setManualTabNumber(e.target.value)}
                placeholder="Deixe vazio para gerar automático"
                min="1"
              />
              <p className="text-xs text-muted-foreground">
                Se não informar, será gerado automaticamente
              </p>
            </div>

            <div className="space-y-2">
              <Label>Mesa (opcional)</Label>
              <Select value={selectedTableId || "none"} onValueChange={(val) => setSelectedTableId(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma mesa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem mesa</SelectItem>
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
                        {isI9 && item.product_name.includes('(') ? (() => {
                          const match = item.product_name.match(/^(.+?)\s*\((.+)\)$/);
                          if (match) {
                            return (
                              <>
                                <p className="font-bold">{match[1]}</p>
                                <p className="text-xs text-muted-foreground">+ {match[2]}</p>
                              </>
                            );
                          }
                          return <p className="font-medium">{item.product_name}</p>;
                        })() : (
                          <p className="font-medium">{item.product_name}</p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {item.quantity}x R$ {item.unit_price.toFixed(2)}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground italic">{item.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">R$ {item.total_price.toFixed(2)}</span>
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
        <DialogContent className="max-w-4xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-4 pb-0 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              Adicionar Itens
              {selectedTab && (
                <Badge variant="secondary">Comanda #{selectedTab.tab_number}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col md:flex-row gap-4 flex-1 overflow-hidden p-4 min-h-0">
            {/* Products List */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {!isI9 && <div className="flex flex-col sm:flex-row gap-2 mb-4 shrink-0">
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
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.filter(c => c.active).map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>}

              {isI9 ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <PDVV2CategoryBrowser
                    companyId={company?.id}
                    pdvOnly={false}
                    onProductSelect={handleAddToCart}
                    maxHeightClassName="max-h-full"
                  />
                </div>
              ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pr-2 pb-4">
                  {filteredProducts.map((product) => (
                    <Card 
                      key={product.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow active:scale-95"
                      onClick={() => handleAddToCart(product)}
                    >
                      <CardContent className="p-2 sm:p-3">
                        <p className="font-medium text-xs sm:text-sm truncate">{product.name}</p>
                        <p className="text-xs sm:text-sm font-bold text-primary">
                          R$ {product.price.toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
              )}
            </div>

            {/* Cart */}
            <div className="w-full md:w-72 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-4 flex flex-col min-h-0 max-h-[40vh] md:max-h-none">
              <div
                className={`flex items-center gap-2 mb-2 md:mb-4 ${isI9 ? 'cursor-pointer select-none' : ''}`}
                onClick={isI9 ? () => setCartCollapsed(c => !c) : undefined}
              >
                <div className="relative">
                  <ShoppingCart className="w-4 h-4 md:w-5 md:h-5" />
                  {isI9 && cart.length > 0 && (
                    <span className={`absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center transition-transform ${cartBounce ? 'scale-125' : 'scale-100'}`}>
                      {cart.reduce((s, i) => s + i.quantity, 0)}
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-sm md:text-base flex-1">Carrinho ({cart.length})</h3>
                {isI9 && (
                  cartCollapsed
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>

              {/* i9 collapsed summary bar */}
              {isI9 && cartCollapsed && cart.length > 0 && (
                <div
                  className="flex items-center justify-between p-2 bg-muted rounded-lg mb-2 cursor-pointer"
                  onClick={() => setCartCollapsed(false)}
                >
                  <span className="text-xs font-medium">{cart.reduce((s, i) => s + i.quantity, 0)} itens</span>
                  <span className="text-xs font-bold">R$ {cartTotal.toFixed(2)} ▲</span>
                </div>
              )}

              <ScrollArea className={`flex-1 min-h-0 ${isI9 && cartCollapsed ? 'hidden' : ''}`}>
                <div className="space-y-2 pr-4">
                  {cart.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Toque em um produto para adicionar
                    </p>
                  ) : (
                    cart.map((item) => (
                      <div key={item.productId} className={`bg-muted rounded-lg space-y-2 ${isI9 ? 'p-3' : 'p-2'}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs sm:text-sm font-medium truncate flex-1">{item.productName}</p>
                          {isI9 ? (
                            <Button variant="ghost" size="icon" className="h-12 w-12 shrink-0" onClick={() => handleRemoveFromCart(item.productId)}>
                              <Trash2 className="w-5 h-5" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleRemoveFromCart(item.productId)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          {isI9 ? (
                            <div className="flex items-center gap-3">
                              <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => handleUpdateCartQuantity(item.productId, -1)}>
                                <Minus className="w-5 h-5" />
                              </Button>
                              <span className="w-8 text-center text-base font-bold">{item.quantity}</span>
                              <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => handleUpdateCartQuantity(item.productId, 1)}>
                                <Plus className="w-5 h-5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => handleUpdateCartQuantity(item.productId, -1)}>
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-6 text-center text-xs sm:text-sm">{item.quantity}</span>
                              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => handleUpdateCartQuantity(item.productId, 1)}>
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                          <span className="text-xs sm:text-sm font-bold">
                            R$ {(item.quantity * item.unitPrice).toFixed(2)}
                          </span>
                        </div>
                        {isI9 ? (
                          item.notes || expandedNotes.has(item.productId) ? (
                            expandedNotes.has(item.productId) ? (
                              <Textarea
                                placeholder="Observação do item..."
                                value={item.notes}
                                onChange={(e) => handleUpdateCartNotes(item.productId, e.target.value)}
                                onBlur={() => { if (!item.notes) setExpandedNotes(prev => { const n = new Set(prev); n.delete(item.productId); return n; }); }}
                                className="min-h-[48px] text-xs resize-none"
                                rows={2}
                                autoFocus
                              />
                            ) : (
                              <button className="flex items-center gap-1 text-xs text-muted-foreground italic hover:text-foreground" onClick={() => setExpandedNotes(prev => new Set(prev).add(item.productId))}>
                                <Pencil className="w-3 h-3" />
                                {item.notes}
                              </button>
                            )
                          ) : (
                            <button className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setExpandedNotes(prev => new Set(prev).add(item.productId))}>
                              <MessageSquare className="w-3 h-3" />
                              + Observação
                            </button>
                          )
                        ) : (
                          <Textarea
                            placeholder="Observação do item..."
                            value={item.notes}
                            onChange={(e) => handleUpdateCartNotes(item.productId, e.target.value)}
                            className="min-h-[48px] text-xs resize-none"
                            rows={2}
                          />
                        )}
                      </div>
                    ))
                  )}
                  <div ref={cartEndRef} />
                </div>
              </ScrollArea>

              {cart.length > 0 && (
                <div className="border-t pt-3 mt-2 md:mt-4 space-y-2">
                  <div className="flex justify-between font-bold text-sm md:text-base">
                    <span>Total</span>
                    <span>R$ {cartTotal.toFixed(2)}</span>
                  </div>
                  <Button 
                    className={`w-full gap-1 ${isI9 ? 'min-h-[60px] text-lg font-bold px-4' : ''}`}
                    onClick={() => handleConfirmItems(true)}
                    disabled={isProcessing}
                    size={isI9 ? 'lg' : 'sm'}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className={`animate-spin ${isI9 ? 'w-6 h-6' : 'w-4 h-4'}`} />
                        {isI9 && <span>Enviando pedido...</span>}
                      </>
                    ) : (
                      <Printer className={isI9 ? 'w-6 h-6' : 'w-4 h-4'} />
                    )}
                    {!isProcessing && 'Finalizar e Imprimir'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Optionals Dialog */}
      {optionalsDialogProduct && (
        <PDVOptionalsDialog
          open={!!optionalsDialogProduct}
          onOpenChange={(open) => {
            if (!open) {
              setOptionalsDialogProduct(null);
              setOptionalsDialogGroups([]);
            }
          }}
          product={{
            id: optionalsDialogProduct.id,
            name: optionalsDialogProduct.name,
            price: optionalsDialogProduct.price,
            imageUrl: optionalsDialogProduct.imageUrl,
            category: optionalsDialogProduct.category,
          }}
          groups={optionalsDialogGroups}
          onAddToCart={handleOptionalsAddToCart}
          companyId={company?.id}
        />
      )}
    </AppLayout>
  );
}
