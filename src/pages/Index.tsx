import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/StatsCard';
import { OrderTabs } from '@/components/OrderTabs';
import { NewOrderDialog } from '@/components/NewOrderDialog';
import { OrderDateFilter } from '@/components/OrderDateFilter';
import { useOrderContext } from '@/contexts/OrderContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Plus, ShoppingBag, Clock, DollarSign, TrendingUp, Loader2, RefreshCw, Zap } from 'lucide-react';
import { PedidoExpressDialog } from '@/components/PedidoExpressDialog';

const Index = () => {
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isPedidoExpressOpen, setIsPedidoExpressOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [activePeriod, setActivePeriod] = useState<'today' | '7d' | '15d' | '30d' | 'all'>('today');
  const { orders, loading } = useOrderContext();
  const { company } = useAuthContext();
  const { settings } = useStoreSettings({ companyId: company?.id });
  
  

  // Helper: get date string in São Paulo timezone (YYYY-MM-DD)
  const toSPDateString = (date: Date) => {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // en-CA gives YYYY-MM-DD
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

  // Derive stats from filtered orders
  const isDateFiltered = !!(startDate || endDate);
  // When no filter, show today's orders; when filtered, show all filtered
  const statsOrders = useMemo(() => {
    if (isDateFiltered) return filteredOrders;
    const todayStr = toSPDateString(new Date());
    return orders.filter((order) => {
      return toSPDateString(new Date(order.createdAt)) === todayStr;
    });
  }, [filteredOrders, orders, isDateFiltered]);

  const pendingCount = filteredOrders.filter(o => o.status === 'pending').length;
  const preparingCount = filteredOrders.filter(o => o.status === 'preparing').length;
  const revenue = statsOrders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + o.total, 0);

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
          <Button onClick={() => setIsPedidoExpressOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Pedido Express</span>
          </Button>
        </div>
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
          activePeriod={activePeriod}
          onPeriodChange={setActivePeriod}
        />

        {/* Stats */}
        {hasVisibleCards && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {showPedidosHoje && (
              <StatsCard
                title={isDateFiltered ? "Pedidos no Período" : "Pedidos Hoje"}
                value={statsOrders.length}
                icon={<ShoppingBag className="w-5 h-5" />}
              />
            )}
            {showAguardando && (
              <StatsCard
                title="Aguardando"
                value={pendingCount + preparingCount}
                icon={<Clock className="w-5 h-5" />}
              />
            )}
            {showFaturamento && (
              <StatsCard
                title={isDateFiltered ? "Faturamento no Período" : "Faturamento Hoje"}
                value={`R$ ${revenue.toFixed(2)}`}
                icon={<DollarSign className="w-5 h-5" />}
              />
            )}
            {showTotalPedidos && (
              <StatsCard
                title="Total de Pedidos"
                value={filteredOrders.length}
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
          <OrderTabs filteredOrders={filteredOrders} />
        </section>
      </div>

      <NewOrderDialog open={isNewOrderOpen} onOpenChange={setIsNewOrderOpen} />
      <PedidoExpressDialog open={isPedidoExpressOpen} onOpenChange={setIsPedidoExpressOpen} />
    </AppLayout>
  );
};

export default Index;
