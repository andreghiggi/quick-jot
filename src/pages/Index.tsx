import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/StatsCard';
import { OrderTabs } from '@/components/OrderTabs';
import { NewOrderDialog } from '@/components/NewOrderDialog';
import { useOrderContext } from '@/contexts/OrderContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Plus, ShoppingBag, Clock, DollarSign, TrendingUp, Loader2, RefreshCw } from 'lucide-react';

const Index = () => {
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const { orders, loading, getTodayOrders, getTodayRevenue, getOrdersByStatus } = useOrderContext();
  const { company } = useAuthContext();
  const { settings } = useStoreSettings({ companyId: company?.id });
  
  const todayOrders = getTodayOrders();
  const todayRevenue = getTodayRevenue();
  const pendingOrders = getOrdersByStatus('pending');
  const preparingOrders = getOrdersByStatus('preparing');

  // Check which cards should be visible
  const showPedidosHoje = settings.showCardPedidosHoje;
  const showAguardando = settings.showCardAguardando;
  const showFaturamento = settings.showCardFaturamento;
  const showTotalPedidos = settings.showCardTotalPedidos;
  const hasVisibleCards = showPedidosHoje || showAguardando || showFaturamento || showTotalPedidos;

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
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => window.location.reload()} 
            className="h-9 w-9"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setIsNewOrderOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Pedido</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Stats */}
        {hasVisibleCards && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {showPedidosHoje && (
              <StatsCard
                title="Pedidos Hoje"
                value={todayOrders.length}
                icon={<ShoppingBag className="w-5 h-5" />}
              />
            )}
            {showAguardando && (
              <StatsCard
                title="Aguardando"
                value={pendingOrders.length + preparingOrders.length}
                icon={<Clock className="w-5 h-5" />}
              />
            )}
            {showFaturamento && (
              <StatsCard
                title="Faturamento Hoje"
                value={`R$ ${todayRevenue.toFixed(2)}`}
                icon={<DollarSign className="w-5 h-5" />}
              />
            )}
            {showTotalPedidos && (
              <StatsCard
                title="Total de Pedidos"
                value={orders.length}
                icon={<TrendingUp className="w-5 h-5" />}
              />
            )}
          </section>
        )}

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
