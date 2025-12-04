import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/StatsCard';
import { OrderTabs } from '@/components/OrderTabs';
import { NewOrderDialog } from '@/components/NewOrderDialog';
import { useOrderContext } from '@/contexts/OrderContext';
import { Plus, ShoppingBag, Clock, DollarSign, TrendingUp, Loader2, Package } from 'lucide-react';

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-primary">
                <ShoppingBag className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Anota Aí</h1>
                <p className="text-xs text-muted-foreground">Gestão de Pedidos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/produtos">
                <Button variant="outline" className="gap-2">
                  <Package className="w-4 h-4" />
                  <span className="hidden sm:inline">Produtos</span>
                </Button>
              </Link>
              <Button onClick={() => setIsNewOrderOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Novo Pedido</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
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
      </main>

      {/* New Order Dialog */}
      <NewOrderDialog open={isNewOrderOpen} onOpenChange={setIsNewOrderOpen} />
    </div>
  );
};

export default Index;
