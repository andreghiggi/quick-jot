import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useOrderContext } from '@/contexts/OrderContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { OrderTabs } from '@/components/OrderTabs';
import { NewOrderDialog } from '@/components/NewOrderDialog';
import { PedidoExpressDialog } from '@/components/PedidoExpressDialog';
import { OrderDateFilter } from '@/components/OrderDateFilter';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

function OrdersContent() {
  const { orders } = useOrderContext();
  const { company } = useAuthContext();
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isPedidoExpressOpen, setIsPedidoExpressOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [activePeriod, setActivePeriod] = useState<'today' | '7d' | '15d' | '30d' | 'all'>('today');

  const toSPDateString = (date: Date) => {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  };

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  const filteredOrders = useMemo(() => {
    // Default (today): show today's orders
    if (!startDate && !endDate) {
      return orders.filter((order) => {
        const orderStr = toSPDateString(new Date(order.createdAt));
        return orderStr === todayStr;
      });
    }
    const startStr = startDate ? toSPDateString(startDate) : null;
    const endStr = endDate ? toSPDateString(endDate) : null;
    return orders.filter((order) => {
      const orderStr = toSPDateString(new Date(order.createdAt));
      if (startStr && orderStr < startStr) return false;
      if (endStr && orderStr > endStr) return false;
      return true;
    });
  }, [orders, startDate, endDate, todayStr]);

  return (
    <AppLayout 
      title="Pedidos" 
      subtitle="Gerencie os pedidos da sua empresa"
      actions={
        <Button onClick={() => setIsPedidoExpressOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Pedido Express</span>
        </Button>
      }
    >
      <div className="space-y-6">
        <OrderDateFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={() => { setStartDate(undefined); setEndDate(undefined); }}
          activePeriod={activePeriod}
          onPeriodChange={setActivePeriod}
        />

        <OrderTabs filteredOrders={filteredOrders} />
      </div>

      <NewOrderDialog open={isNewOrderOpen} onOpenChange={setIsNewOrderOpen} />
      <PedidoExpressDialog open={isPedidoExpressOpen} onOpenChange={setIsPedidoExpressOpen} />
    </AppLayout>
  );
}

export default function Orders() {
  return <OrdersContent />;
}
