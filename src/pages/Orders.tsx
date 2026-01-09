import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { OrderProvider } from '@/contexts/OrderContext';
import { OrderTabs } from '@/components/OrderTabs';
import { StatsCard } from '@/components/StatsCard';
import { NewOrderDialog } from '@/components/NewOrderDialog';
import { useOrders } from '@/hooks/useOrders';
import { ShoppingBag, Clock, CheckCircle, XCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

function OrdersContent() {
  const { orders } = useOrders();
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);

  const stats = {
    pending: orders.filter(o => o.status === 'pending').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  };

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
            title="Entregues"
            value={stats.delivered}
            icon={<XCircle className="w-5 h-5" />}
            color="muted"
          />
        </div>

        {/* Orders */}
        <OrderTabs />
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
