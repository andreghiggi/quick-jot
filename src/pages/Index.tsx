import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/StatsCard';
import { useOrderContext } from '@/contexts/OrderContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Plus, Clock, CheckCircle, ShoppingBag, TrendingUp, DollarSign, Loader2, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { PedidoExpressDialog } from '@/components/PedidoExpressDialog';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { OrderTabs } from '@/components/OrderTabs';

const Index = () => {
  const [isPedidoExpressOpen, setIsPedidoExpressOpen] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const { orders, loading } = useOrderContext();
  const { company } = useAuthContext();
  const { settings } = useStoreSettings({ companyId: company?.id });

  const toSPDateString = (date: Date) => {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  };

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // Dashboard shows only today's non-delivered orders
  const todayOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderStr = toSPDateString(new Date(order.createdAt));
      return orderStr === todayStr;
    });
  }, [orders, todayStr]);

  const activeOrders = useMemo(() => {
    return todayOrders.filter(o => o.status !== 'delivered');
  }, [todayOrders]);

  const pendingCount = activeOrders.filter(o => o.status === 'pending').length;
  const preparingCount = activeOrders.filter(o => o.status === 'preparing').length;
  const readyCount = activeOrders.filter(o => o.status === 'ready').length;
  const deliveredCount = todayOrders.filter(o => o.status === 'delivered').length;
  const revenue = todayOrders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + o.total, 0);

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
          <Button onClick={() => setIsPedidoExpressOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Pedido Express</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="flex flex-nowrap gap-3 overflow-x-auto">
          {settings.showCardPendentes && (
            <StatsCard
              title="Pendentes"
              value={pendingCount}
              icon={<Clock className="w-4 h-4" />}
              color="warning"
              className="flex-1 min-w-0"
            />
          )}
          {settings.showCardPreparando && (
            <StatsCard
              title="Preparando"
              value={preparingCount}
              icon={<ShoppingBag className="w-4 h-4" />}
              color="primary"
              className="flex-1 min-w-0"
            />
          )}
          {settings.showCardProntos && (
            <StatsCard
              title="Prontos"
              value={readyCount}
              icon={<CheckCircle className="w-4 h-4" />}
              color="success"
              className="flex-1 min-w-0"
            />
          )}
          {settings.showCardEntregues && (
            <StatsCard
              title="Entregues"
              value={deliveredCount}
              icon={<CheckCircle className="w-4 h-4" />}
              color="success"
              className="flex-1 min-w-0"
            />
          )}
          {settings.showCardTodos && (
            <StatsCard
              title="Todos"
              value={todayOrders.length}
              icon={<TrendingUp className="w-4 h-4" />}
              className="flex-1 min-w-0"
            />
          )}
          {settings.showCardFaturamento && (
            <StatsCard
              title="Faturamento do Dia"
              value={showRevenue ? `R$ ${revenue.toFixed(2)}` : 'R$ ••••••'}
              icon={<DollarSign className="w-5 h-5" />}
              color="muted"
              className="min-w-[220px] flex-[2]"
              action={
                <button
                  onClick={() => setShowRevenue(prev => !prev)}
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                  title={showRevenue ? 'Ocultar valor' : 'Mostrar valor'}
                >
                  {showRevenue ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
              }
            />
          )}
        </section>
      </div>

      <PedidoExpressDialog open={isPedidoExpressOpen} onOpenChange={setIsPedidoExpressOpen} />
    </AppLayout>
  );
};

export default Index;
