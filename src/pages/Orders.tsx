import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { OrderProvider, useOrderContext } from '@/contexts/OrderContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { OrderTabs } from '@/components/OrderTabs';
import { StatsCard } from '@/components/StatsCard';
import { NewOrderDialog } from '@/components/NewOrderDialog';
import { PedidoExpressDialog } from '@/components/PedidoExpressDialog';
import { OrderDateFilter } from '@/components/OrderDateFilter';
import { ShoppingBag, Clock, CheckCircle, Truck, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Order } from '@/types/order';

function OrdersContent() {
  const { orders, getOrdersByStatus } = useOrderContext();
  const { company } = useAuthContext();
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isPedidoExpressOpen, setIsPedidoExpressOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const isLancheriaI9 = company?.name?.toLowerCase().includes('lancheria da i9');

  const filteredOrders = useMemo(() => {
    if (!startDate && !endDate) return orders;
    return orders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (orderDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (orderDate > end) return false;
      }
      return true;
    });
  }, [orders, startDate, endDate]);

  const stats = {
    pending: filteredOrders.filter(o => o.status === 'pending').length,
    preparing: filteredOrders.filter(o => o.status === 'preparing').length,
    ready: filteredOrders.filter(o => o.status === 'ready').length,
    delivered: filteredOrders.filter(o => o.status === 'delivered').length,
  };

  const revenue = filteredOrders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <AppLayout 
      title="Pedidos" 
      subtitle="Gerencie os pedidos da sua empresa"
      actions={
        <Button onClick={() => setIsNewOrderOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Pedido</span>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Date Filter */}
        <OrderDateFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={() => { setStartDate(undefined); setEndDate(undefined); }}
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            title="Pendentes"
            value={stats.pending}
            icon={<Clock className="w-5 h-5" />}
            color="warning"
          />
          <StatsCard
            title="Preparando"
            value={stats.preparing}
            icon={<ShoppingBag className="w-5 h-5" />}
            color="primary"
          />
          <StatsCard
            title="Prontos"
            value={stats.ready}
            icon={<CheckCircle className="w-5 h-5" />}
            color="success"
          />
          <StatsCard
            title="Faturamento"
            value={`R$ ${revenue.toFixed(2)}`}
            icon={<Truck className="w-5 h-5" />}
            color="muted"
          />
        </div>

        {/* Orders */}
        <OrderTabs filteredOrders={filteredOrders} />
      </div>

      <NewOrderDialog open={isNewOrderOpen} onOpenChange={setIsNewOrderOpen} />
    </AppLayout>
  );
}

export default function Orders() {
  return (
    <OrderProvider>
      <OrdersContent />
    </OrderProvider>
  );
}
