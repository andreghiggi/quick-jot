import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/StatsCard';
import { OrderTabs } from '@/components/OrderTabs';
import { NewOrderDialog } from '@/components/NewOrderDialog';
import { OrderDateFilter } from '@/components/OrderDateFilter';
import { useOrderContext } from '@/contexts/OrderContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Plus, Clock, CheckCircle, Truck, ShoppingBag, TrendingUp, DollarSign, Loader2, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { PedidoExpressDialog } from '@/components/PedidoExpressDialog';
import { useStoreSettings } from '@/hooks/useStoreSettings';

const Index = () => {
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isPedidoExpressOpen, setIsPedidoExpressOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [activePeriod, setActivePeriod] = useState<'today' | '7d' | '15d' | '30d' | 'all'>('today');
  const [showRevenue, setShowRevenue] = useState(false);
  const { orders, loading } = useOrderContext();
  const { company } = useAuthContext();
  const { settings } = useStoreSettings({ companyId: company?.id });

  const toSPDateString = (date: Date) => {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  };

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  const filteredOrders = useMemo(() => {
    let base = orders.filter((order) => {
      const orderStr = toSPDateString(new Date(order.createdAt));
      return orderStr === todayStr;
    });
    if (startDate || endDate) {
      const startStr = startDate ? toSPDateString(startDate) : null;
      const endStr = endDate ? toSPDateString(endDate) : null;
      base = orders.filter((order) => {
        const orderStr = toSPDateString(new Date(order.createdAt));
        if (startStr && orderStr < startStr) return false;
        if (endStr && orderStr > endStr) return false;
        return true;
      });
    }
    return base;
  }, [orders, startDate, endDate, todayStr]);

  const pendingCount = filteredOrders.filter(o => o.status === 'pending').length;
  const preparingCount = filteredOrders.filter(o => o.status === 'preparing').length;
  const readyCount = filteredOrders.filter(o => o.status === 'ready').length;
  const deliveredCount = filteredOrders.filter(o => o.status === 'delivered').length;
  const revenue = filteredOrders
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
        <OrderDateFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={() => { setStartDate(undefined); setEndDate(undefined); }}
          activePeriod={activePeriod}
          onPeriodChange={setActivePeriod}
        />

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
              icon={<Truck className="w-4 h-4" />}
              color="success"
              className="flex-1 min-w-0"
            />
          )}
          {settings.showCardTodos && (
            <StatsCard
              title="Todos"
              value={filteredOrders.length}
              icon={<TrendingUp className="w-4 h-4" />}
              className="flex-1 min-w-0"
            />
          )}
          {settings.showCardFaturamento && (
            <StatsCard
              title="Faturamento no Período"
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

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Pedidos</h2>
          </div>
          <OrderTabs filteredOrders={filteredOrders} />
        </section>
      </div>

      <NewOrderDialog open={isNewOrderOpen} onOpenChange={setIsNewOrderOpen} />
      <PedidoExpressDialog open={isPedidoExpressOpen} onOpenChange={setIsPedidoExpressOpen} />
    </AppLayout>
  );
};

export default Index;
