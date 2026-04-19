import { useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useOrders } from '@/hooks/useOrders';
import { useCashRegister } from '@/hooks/useCashRegister';
import { useTabs } from '@/hooks/useTabs';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { Order, OrderStatus } from '@/types/order';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { PDVV2TopBar } from '@/components/pdv-v2/PDVV2TopBar';
import { PDVV2SummaryCards } from '@/components/pdv-v2/PDVV2SummaryCards';
import { PDVV2StatusFilters, StatusFilter } from '@/components/pdv-v2/PDVV2StatusFilters';
import { PDVV2OrderCard } from '@/components/pdv-v2/PDVV2OrderCard';
import { OccupiedTab } from '@/components/pdv-v2/PDVV2TablesPanel';
import { PDVV2TablesGrid } from '@/components/pdv-v2/PDVV2TablesGrid';
import { PDVV2TablesSummaryCards } from '@/components/pdv-v2/PDVV2TablesSummaryCards';
import { PDVV2CloseCashDialog, CloseCashSale } from '@/components/pdv-v2/PDVV2CloseCashDialog';
import { PDVV2PaymentDialog } from '@/components/pdv-v2/PDVV2PaymentDialog';
import { PedidoExpressDialog } from '@/components/PedidoExpressDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ClipboardList, UtensilsCrossed } from 'lucide-react';

import { printOnlyReceipt } from '@/utils/pdvV2Print';

function isDelivery(o: Order) {
  return !!o.deliveryAddress && o.deliveryAddress.trim().length > 0;
}

export default function PDVV2() {
  const { company, user } = useAuthContext();
  const companyId = company?.id;
  const { isModuleEnabled } = useCompanyModules({ companyId });
  const tablesEnabled = isModuleEnabled('mesas');

  const { orders, updateOrderStatus } = useOrders({ companyId });
  const { currentRegister, totalSales, sales, closeRegister, addSale } = useCashRegister({ companyId });
  const { openTabs, getTabTotal, closeTab } = useTabs({ companyId });
  const { settings } = useStoreSettings({ companyId });
  const { activePaymentMethods } = usePaymentMethods({ companyId, channel: 'pdv' });

  const [showCash, setShowCash] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showTablesRevenue, setShowTablesRevenue] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'tables'>('orders');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [closeOpen, setCloseOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [chargeOrder, setChargeOrder] = useState<Order | null>(null);
  const [importingTab, setImportingTab] = useState<OccupiedTab | null>(null);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: orders.length,
      pending: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
    };
    for (const o of orders) c[o.status as OrderStatus]++;
    return c;
  }, [orders]);

  // Faturamento real = vendas pagas no caixa atual (pdv_sales)
  const revenue = totalSales;

  const filteredOrders = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  const occupiedTabs: OccupiedTab[] = useMemo(
    () =>
      openTabs.map((t) => ({
        id: t.id,
        tabNumber: t.tab_number,
        tableNumber: t.table?.number ?? null,
        customerName: t.customer_name,
        total: getTabTotal(t),
      })),
    [openTabs, getTabTotal]
  );

  // Métricas da aba Mesas — derivado das vendas do caixa atual com notes contendo "Comanda"
  const tablesMetrics = useMemo(() => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    let closedToday = 0;
    let revenueToday = 0;
    for (const s of sales) {
      const isFromTab = s.notes?.toLowerCase().includes('comanda');
      if (!isFromTab) continue;
      const ts = s.created_at ? new Date(s.created_at).getTime() : 0;
      if (ts >= startOfDay) {
        closedToday++;
        revenueToday += Number(s.final_total) || 0;
      }
    }
    const occupiedTables = occupiedTabs.filter((t) => t.tableNumber != null).length;
    return {
      occupiedTables,
      openTabsCount: occupiedTabs.length,
      closedToday,
      revenueToday,
    };
  }, [sales, occupiedTabs]);

  const cashAmount = (currentRegister?.opening_amount || 0) + totalSales;
  const cashOpen = !!currentRegister;

  // Mapeia vendas do caixa atual em estrutura para o fechamento
  const closeCashSales: CloseCashSale[] = useMemo(() => {
    return sales.map((s) => {
      // Determina origem cruzando com orders (quando há order_id)
      let origin: CloseCashSale['origin'] = 'balcao';
      const orderId = (s as any).order_id as string | undefined;
      if (orderId) {
        const linked = orders.find((o) => o.id === orderId);
        if (linked) {
          if (linked.origin === 'mesa') origin = 'mesa';
          else if (linked.origin === 'balcao') origin = 'balcao';
          else origin = isDelivery(linked) ? 'cardapio_delivery' : 'cardapio_retirada';
        } else {
          origin = 'outros';
        }
      } else {
        // Sem order vinculado — venda balcão direta
        // ou comanda importada (notes contém "Comanda")
        if (s.notes?.toLowerCase().includes('comanda')) origin = 'mesa';
        else origin = 'balcao';
      }

      return {
        id: s.id,
        final_total: Number(s.final_total) || 0,
        payment_method_name: s.payment_method?.name || 'Sem forma',
        origin,
      };
    });
  }, [sales, orders]);

  function handleAdvance(order: Order) {
    const next: Record<OrderStatus, OrderStatus | null> = {
      pending: 'preparing',
      preparing: 'ready',
      ready: 'delivered',
      delivered: null,
    };
    const target = next[order.status];
    if (target) updateOrderStatus(order.id, target);
  }

  function handleChargeFromOrder(order: Order) {
    if (!cashOpen) {
      toast.error('Abra o caixa para cobrar');
      return;
    }
    setChargeOrder(order);
  }

  async function handleChangePayment(order: Order, methodName: string) {
    try {
      const baseNotes = order.notes || '';
      const newNotes = baseNotes.match(/Pagamento:\s*.+?(\s*[\(|]|$)/i)
        ? baseNotes.replace(/Pagamento:\s*.+?(\s*[\(|]|$)/i, `Pagamento: ${methodName}$1`)
        : baseNotes
        ? `${baseNotes} | Pagamento: ${methodName}`
        : `Pagamento: ${methodName}`;

      const { error } = await supabase
        .from('orders')
        .update({ notes: newNotes })
        .eq('id', order.id);
      if (error) throw error;
      toast.success('Forma de pagamento atualizada');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao atualizar pagamento');
    }
  }

  async function confirmChargeOrder({
    paymentMethodId,
    paymentName,
    discount,
    finalTotal,
    documentMode,
  }: { paymentMethodId: string; paymentName: string; discount: number; finalTotal: number; documentMode: 'sale_only' | 'sale_with_nfce' }) {
    if (!chargeOrder || !user || !currentRegister) {
      toast.error('Caixa precisa estar aberto');
      return;
    }
    const items = chargeOrder.items.map((i) => ({
      product_id: i.productId || null,
      product_name: i.name,
      quantity: i.quantity,
      unit_price: i.price,
    }));
    const saleId = await addSale(
      items,
      paymentMethodId,
      user.id,
      discount,
      chargeOrder.customerName,
      `Pedido #${chargeOrder.dailyNumber} | Pagamento: ${paymentName}`,
      chargeOrder.id
    );
    if (saleId) {
      await updateOrderStatus(chargeOrder.id, 'delivered');
      toast.success('Cobrança registrada!');
      setChargeOrder(null);
    }
  }

  async function confirmImportTab({
    paymentMethodId,
    paymentName,
    discount,
    finalTotal,
    documentMode,
  }: { paymentMethodId: string; paymentName: string; discount: number; finalTotal: number; documentMode: 'sale_only' | 'sale_with_nfce' }) {
    if (!importingTab || !user || !currentRegister || !companyId) {
      toast.error('Caixa precisa estar aberto');
      return;
    }
    const fullTab = openTabs.find((t) => t.id === importingTab.id);
    if (!fullTab?.items?.length) {
      toast.error('Comanda sem itens');
      return;
    }
    const items = fullTab.items.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }));
    const customer =
      fullTab.customer_name ||
      (fullTab.table?.number ? `Mesa ${fullTab.table.number}` : `Comanda ${fullTab.tab_number}`);
    const saleId = await addSale(
      items,
      paymentMethodId,
      user.id,
      discount,
      customer,
      `Comanda #${fullTab.tab_number} | Pagamento: ${paymentName}`
    );
    if (saleId) {
      const paperSize = (settings.printerPaperSize as '58mm' | '80mm') || '80mm';
      await printOnlyReceipt({
        companyId,
        orderCode: `M${fullTab.tab_number}`,
        dailyNumber: fullTab.tab_number,
        customerName: customer,
        items: fullTab.items.map((i) => ({
          name: i.product_name,
          quantity: i.quantity,
          price: i.unit_price,
          notes: i.notes || undefined,
        })),
        total: finalTotal,
        notes: `Pagamento: ${paymentName}${discount > 0 ? ` | Desconto: R$ ${discount.toFixed(2)}` : ''}`,
        paperSize,
      });
      await closeTab(fullTab.id);
      toast.success('Comanda importada e fechada!');
      setImportingTab(null);
    }
  }

  async function handleCloseCash(closingAmount: number, notes: string) {
    if (!user) return;
    await closeRegister(closingAmount, user.id, notes);
  }

  return (
    <PDVV2Layout>
      <div className="flex flex-col h-[calc(100vh-3rem)]">
        <PDVV2TopBar
          storeName={company?.name || 'Loja'}
          cashOpen={cashOpen}
          cashAmount={cashAmount}
          showCashAmount={showCash}
          onToggleCashAmount={() => setShowCash((v) => !v)}
          onCloseCash={() => setCloseOpen(true)}
          onNewOrder={() => setNewOrderOpen(true)}
        />

        {tablesEnabled ? (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'orders' | 'tables')}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="px-4 pt-3">
              <TabsList>
                <TabsTrigger value="orders" className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Pedidos
                </TabsTrigger>
                <TabsTrigger value="tables" className="gap-2">
                  <UtensilsCrossed className="h-4 w-4" />
                  Mesas
                  {occupiedTabs.length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                      {occupiedTabs.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="orders" className="flex-1 overflow-hidden mt-3 flex flex-col">
              <PDVV2SummaryCards
                pending={counts.pending}
                preparing={counts.preparing}
                ready={counts.ready}
                delivered={counts.delivered}
                total={counts.all}
                revenue={revenue}
                showRevenue={showRevenue}
                onToggleRevenue={() => setShowRevenue((v) => !v)}
              />
              <PDVV2StatusFilters active={filter} onChange={setFilter} counts={counts} />
              <div className="flex-1 overflow-hidden px-4 pb-4">
                <ScrollArea className="h-full">
                  {filteredOrders.length === 0 ? (
                    <Card>
                      <CardContent className="py-16 text-center text-muted-foreground">
                        Nenhum pedido neste filtro.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
                      {filteredOrders.map((o) => (
                        <PDVV2OrderCard
                          key={o.id}
                          order={o}
                          onAdvance={handleAdvance}
                          onCharge={handleChargeFromOrder}
                          onChangePayment={handleChangePayment}
                          paymentOptions={activePaymentMethods.map((m) => ({ id: m.id, name: m.name }))}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="tables" className="flex-1 overflow-hidden mt-0 flex flex-col data-[state=active]:pt-0">
              <PDVV2TablesSummaryCards
                occupiedTables={tablesMetrics.occupiedTables}
                openTabs={tablesMetrics.openTabsCount}
                closedToday={tablesMetrics.closedToday}
                revenueToday={tablesMetrics.revenueToday}
                showRevenue={showTablesRevenue}
                onToggleRevenue={() => setShowTablesRevenue((v) => !v)}
              />
              <div className="flex-1 overflow-hidden px-4 pb-4">
                <ScrollArea className="h-full">
                  <PDVV2TablesGrid tabs={occupiedTabs} onImport={(t) => setImportingTab(t)} />
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <>
            <PDVV2SummaryCards
              pending={counts.pending}
              preparing={counts.preparing}
              ready={counts.ready}
              delivered={counts.delivered}
              total={counts.all}
              revenue={revenue}
              showRevenue={showRevenue}
              onToggleRevenue={() => setShowRevenue((v) => !v)}
            />
            <PDVV2StatusFilters active={filter} onChange={setFilter} counts={counts} />
            <div className="flex-1 overflow-hidden px-4 pb-4">
              <ScrollArea className="h-full">
                {filteredOrders.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                      Nenhum pedido neste filtro.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
                    {filteredOrders.map((o) => (
                      <PDVV2OrderCard
                        key={o.id}
                        order={o}
                        onAdvance={handleAdvance}
                        onCharge={handleChargeFromOrder}
                        onChangePayment={handleChangePayment}
                        paymentOptions={activePaymentMethods.map((m) => ({ id: m.id, name: m.name }))}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </>
        )}
      </div>

      <PedidoExpressDialog open={newOrderOpen} onOpenChange={setNewOrderOpen} />

      <PDVV2CloseCashDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        expectedAmount={cashAmount}
        sales={closeCashSales}
        onConfirm={handleCloseCash}
      />

      <PDVV2PaymentDialog
        open={!!chargeOrder}
        onOpenChange={(o) => !o && setChargeOrder(null)}
        companyId={companyId}
        total={chargeOrder?.total || 0}
        title={`Cobrar pedido #${chargeOrder?.dailyNumber}`}
        showDocumentMode
        onConfirm={confirmChargeOrder}
      />

      <PDVV2PaymentDialog
        open={!!importingTab}
        onOpenChange={(o) => !o && setImportingTab(null)}
        companyId={companyId}
        total={importingTab?.total || 0}
        title={
          importingTab?.tableNumber
            ? `Cobrar Mesa ${importingTab.tableNumber}`
            : `Cobrar Comanda ${importingTab?.tabNumber}`
        }
        showDocumentMode
        onConfirm={confirmImportTab}
      />
    </PDVV2Layout>
  );
}
