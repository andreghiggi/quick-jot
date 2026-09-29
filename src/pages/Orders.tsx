import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useOrderContext } from '@/contexts/OrderContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { OrderTabs } from '@/components/OrderTabs';
import { NewOrderDialog } from '@/components/NewOrderDialog';
import { PedidoExpressDialog } from '@/components/PedidoExpressDialog';
import { OrderDateFilter } from '@/components/OrderDateFilter';
import {
  OrderFilters,
  filterOrders,
  summarizeOrders,
  type DeliveryFilter,
  type OriginFilter,
  type PaymentFilter,
} from '@/components/OrderFilters';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Order } from '@/types/order';

function OrdersContent() {
  const { orders, fetchOrdersByDateRange } = useOrderContext();
  const { company } = useAuthContext();
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isPedidoExpressOpen, setIsPedidoExpressOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [activePeriod, setActivePeriod] = useState<'today' | '7d' | '15d' | '30d' | 'all'>('today');
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>([]);
  // `orders` (tempo real) só cobre as últimas 48h + pedidos ainda ativos.
  // Quando o usuário escolhe um período com data, buscamos esse intervalo
  // direto no banco, pra pedidos antigos já finalizados aparecerem também.
  const [historicalOrders, setHistoricalOrders] = useState<Order[] | null>(null);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  const toSPDateString = (date: Date) => {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  };

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  useEffect(() => {
    if (!startDate && !endDate) {
      setHistoricalOrders(null);
      return;
    }
    let cancelled = false;
    setLoadingHistorical(true);
    fetchOrdersByDateRange(startDate ?? new Date(2020, 0, 1), endDate ?? new Date())
      .then((result) => {
        if (!cancelled) setHistoricalOrders(result);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistorical(false);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, fetchOrdersByDateRange]);

  const dateFilteredOrders = useMemo(() => {
    // Default (today): show today's orders (lista em tempo real)
    if (!startDate && !endDate) {
      return orders.filter((order) => {
        const orderStr = toSPDateString(new Date(order.createdAt));
        return orderStr === todayStr;
      });
    }
    // Período com data selecionada: usa o resultado buscado direto no banco
    // (cobre pedidos antigos já entregues/cancelados, fora da janela de 48h).
    const sourceOrders = historicalOrders ?? [];
    const startStr = startDate ? toSPDateString(startDate) : null;
    const endStr = endDate ? toSPDateString(endDate) : null;
    return sourceOrders.filter((order) => {
      const orderStr = toSPDateString(new Date(order.createdAt));
      if (startStr && orderStr < startStr) return false;
      if (endStr && orderStr > endStr) return false;
      return true;
    });
  }, [orders, historicalOrders, startDate, endDate, todayStr]);

  const filteredOrders = useMemo(
    () => filterOrders(dateFilteredOrders, deliveryFilter, originFilter, paymentFilter),
    [dateFilteredOrders, deliveryFilter, originFilter, paymentFilter],
  );

  const summary = useMemo(() => summarizeOrders(filteredOrders), [filteredOrders]);
  const formatBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
        {loadingHistorical && (
          <p className="text-sm text-muted-foreground">Carregando pedidos do período...</p>
        )}

        <OrderFilters
          orders={dateFilteredOrders}
          delivery={deliveryFilter}
          origin={originFilter}
          payment={paymentFilter}
          onDeliveryChange={setDeliveryFilter}
          onOriginChange={setOriginFilter}
          onPaymentChange={setPaymentFilter}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Pedidos</p>
            <p className="text-lg font-semibold">{summary.count}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Faturamento</p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">{formatBRL(summary.total)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Ticket médio</p>
            <p className="text-lg font-semibold">{formatBRL(summary.avg)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Cancelados</p>
            <p className="text-lg font-semibold">{summary.cancelled}</p>
          </div>
        </div>

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
