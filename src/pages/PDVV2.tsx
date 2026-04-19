import { useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useOrders } from '@/hooks/useOrders';
import { useCashRegister } from '@/hooks/useCashRegister';
import { useTabs } from '@/hooks/useTabs';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { Order, OrderStatus } from '@/types/order';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { PDVV2Layout } from '@/components/layout/PDVV2Layout';
import { PDVV2TopBar } from '@/components/pdv-v2/PDVV2TopBar';
import { PDVV2SummaryCards } from '@/components/pdv-v2/PDVV2SummaryCards';
import { PDVV2StatusFilters, StatusFilter } from '@/components/pdv-v2/PDVV2StatusFilters';
import { PDVV2OrderCard } from '@/components/pdv-v2/PDVV2OrderCard';
import { PDVV2TablesPanel, OccupiedTab } from '@/components/pdv-v2/PDVV2TablesPanel';
import { PDVV2CloseCashDialog } from '@/components/pdv-v2/PDVV2CloseCashDialog';
import { PDVV2PaymentDialog } from '@/components/pdv-v2/PDVV2PaymentDialog';
import { PedidoExpressDialog } from '@/components/PedidoExpressDialog';

import { printOnlineOrBalcao, printOnlyReceipt } from '@/utils/pdvV2Print';

export default function PDVV2() {
  const { company, user } = useAuthContext();
  const companyId = company?.id;
  const { isModuleEnabled } = useCompanyModules({ companyId });
  const tablesEnabled = isModuleEnabled('mesas');

  const { orders, updateOrderStatus } = useOrders({ companyId });
  const { currentRegister, totalSales, closeRegister, addSale } = useCashRegister({ companyId });
  const { openTabs, getTabTotal, closeTab } = useTabs({ companyId });
  const { settings } = useStoreSettings({ companyId });

  const [showCash, setShowCash] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true);
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

  const revenue = useMemo(
    () => orders.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.total, 0),
    [orders]
  );

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

  const cashAmount = (currentRegister?.opening_amount || 0) + totalSales;
  const cashOpen = !!currentRegister;

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
    setChargeOrder(order);
  }

  async function confirmChargeOrder({
    paymentMethodId,
    paymentName,
    discount,
    finalTotal,
  }: { paymentMethodId: string; paymentName: string; discount: number; finalTotal: number }) {
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
  }: { paymentMethodId: string; paymentName: string; discount: number; finalTotal: number }) {
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
    const customer = fullTab.customer_name || (fullTab.table?.number ? `Mesa ${fullTab.table.number}` : `Comanda ${fullTab.tab_number}`);
    const saleId = await addSale(
      items,
      paymentMethodId,
      user.id,
      discount,
      customer,
      `Comanda #${fullTab.tab_number} | Pagamento: ${paymentName}`
    );
    if (saleId) {
      // Imprime apenas recibo (regra: importar mesa = só recibo)
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
      // Fecha a comanda
      await closeTab(fullTab.id);
      toast.success('Comanda importada e fechada!');
      setImportingTab(null);
    }
  }

  async function handleCloseCash(closingAmount: number, notes: string) {
    if (!user) return;
    await closeRegister(closingAmount, user.id, notes);
  }

  // Hook customizado: ao detectar nova ordem balcão criada, dispara impressão.
  // Aqui apenas re-imprime quando o usuário clicar manualmente — para evitar
  // duplicação, a impressão automática acontecerá via PedidoExpressDialog
  // (que já imprime produção). Para garantir o RECIBO também (regra balcão),
  // expomos este botão futuro. Por ora, novas ordens balcão impressas pelo
  // próprio Pedido Express continuam imprimindo só produção; o operador pode
  // imprimir recibo manualmente via tela de cobrança.

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

        <div className={`flex-1 overflow-hidden grid gap-4 px-4 pb-4 ${tablesEnabled ? 'grid-cols-1 lg:grid-cols-[1fr,320px]' : 'grid-cols-1'}`}>
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
                    order={o as any}
                    onAdvance={handleAdvance}
                    onCharge={handleChargeFromOrder}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {tablesEnabled && (
            <PDVV2TablesPanel tabs={occupiedTabs} onImport={(t) => setImportingTab(t)} />
          )}
        </div>
      </div>

      {/* Reuso integral do Pedido Express para "+ Novo Pedido" balcão */}
      <PedidoExpressDialog open={newOrderOpen} onOpenChange={setNewOrderOpen} />

      <PDVV2CloseCashDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        expectedAmount={cashAmount}
        onConfirm={handleCloseCash}
      />

      <PDVV2PaymentDialog
        open={!!chargeOrder}
        onOpenChange={(o) => !o && setChargeOrder(null)}
        companyId={companyId}
        total={chargeOrder?.total || 0}
        title={`Cobrar pedido #${chargeOrder?.dailyNumber}`}
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
        onConfirm={confirmImportTab}
      />
    </PDVV2Layout>
  );
}
