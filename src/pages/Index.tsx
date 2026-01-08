import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/StatsCard';
import { OrderTabs } from '@/components/OrderTabs';
import { NewOrderDialog } from '@/components/NewOrderDialog';
import { useOrderContext } from '@/contexts/OrderContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Plus, ShoppingBag, Clock, DollarSign, TrendingUp, Loader2 } from 'lucide-react';

const Index = () => {
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const { orders, loading, getTodayOrders, getTodayRevenue, getOrdersByStatus } = useOrderContext();
  
  const todayOrders = getTodayOrders();
  const todayRevenue = getTodayRevenue();
  const pendingOrders = getOrdersByStatus('pending');
  const preparingOrders = getOrdersByStatus('preparing');

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppLayout 
      title="Dashboard" 
      actions={
        <Button onClick={() => setIsNewOrderOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Pedido</span>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Stats */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Pedidos Hoje"
            value={todayOrders.length}
            icon={ShoppingBag}
          />
          <StatsCard
            title="Aguardando"
            value={pendingOrders.length + preparingOrders.length}
            icon={Clock}
          />
          <StatsCard
            title="Faturamento Hoje"
            value={`R$ ${todayRevenue.toFixed(2)}`}
            icon={DollarSign}
          />
          <StatsCard
            title="Total de Pedidos"
            value={orders.length}
            icon={TrendingUp}
          />
        </section>

        {/* Orders Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Pedidos</h2>
          </div>
          <OrderTabs />
        </section>
      </div>

      {/* New Order Dialog */}
      <NewOrderDialog open={isNewOrderOpen} onOpenChange={setIsNewOrderOpen} />
    </AppLayout>
  );
};

export default Index;
