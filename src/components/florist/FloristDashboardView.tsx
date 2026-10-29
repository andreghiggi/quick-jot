import { useEffect, useMemo, useState } from 'react';
import { Clock, CheckCircle, Truck, CalendarDays, TrendingUp, DollarSign, Eye, EyeOff, Store, Inbox } from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { OrderCard } from '@/components/OrderCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Order } from '@/types/order';
import { buildFloristAgenda, countScheduledToday, toSPDate } from '@/lib/floristAgenda';
import { useFloristRevenueToday } from '@/hooks/useFloristRevenueToday';
import { formatPrice } from '@/lib/utils';

interface Props {
  orders: Order[];
  companyId?: string;
  paperSize?: '58mm' | '80mm';
  storeName?: string;
}

function Column({ title, icon, orders, empty, paperSize, storeName }: {
  title: string; icon: React.ReactNode; orders: Order[]; empty: string;
  paperSize?: '58mm' | '80mm'; storeName?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        <span>{title}</span>
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} paperSize={paperSize} storeName={storeName} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FloristDashboardView({ orders, companyId, paperSize, storeName }: Props) {
  const today = toSPDate(new Date());
  const [showRevenue, setShowRevenue] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  const todayOrders = useMemo(
    () => orders.filter((o) => toSPDate(new Date(o.createdAt)) === today),
    [orders, today],
  );
  const agenda = useMemo(() => buildFloristAgenda(orders, today), [orders, today]);
  const scheduled = useMemo(() => countScheduledToday(orders, today), [orders, today]);
  const revenue = useFloristRevenueToday(companyId, true, todayOrders);

  const notCancelled = (o: Order) => o.status !== 'canceled' && !o.notes?.includes('[CANCELADA]');
  const pendingCount = todayOrders.filter((o) => o.status === 'pending' && notCancelled(o)).length;
  const readyCount = orders.filter((o) => o.status === 'ready' && notCancelled(o)).length;
  const deliveredCount = todayOrders.filter((o) => o.status === 'delivered').length;
  const totalCount = todayOrders.filter(notCancelled).length;

  // Aviso diário: uma vez por dia, por loja, neste navegador.
  useEffect(() => {
    if (!companyId) return;
    const key = `florist-daily-notice:${companyId}`;
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch { /* noop */ }
    setNoticeOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, today]);

  return (
    <div className="space-y-6">
      <section className="flex flex-nowrap gap-3 overflow-x-auto">
        <StatsCard title="Pendentes" value={pendingCount} icon={<Clock className="w-4 h-4" />} color="warning" className="flex-1 min-w-0" />
        <StatsCard title="Prontos" value={readyCount} icon={<CheckCircle className="w-4 h-4" />} color="success" className="flex-1 min-w-0" />
        <StatsCard title="Entregues" value={deliveredCount} icon={<Truck className="w-4 h-4" />} color="success" className="flex-1 min-w-0" />
        <StatsCard title="Agendados para Hoje" value={scheduled.total} icon={<CalendarDays className="w-4 h-4" />} color="primary" className="flex-1 min-w-0" />
        <StatsCard title="Total" value={totalCount} icon={<TrendingUp className="w-4 h-4" />} className="flex-1 min-w-0" />
        <StatsCard
          title="Faturamento do Dia"
          value={showRevenue ? formatPrice(revenue) : 'R$ ••••••'}
          icon={<DollarSign className="w-5 h-5" />}
          color="muted"
          className="min-w-[220px] flex-[2]"
          action={
            <button
              onClick={() => setShowRevenue((p) => !p)}
              className="p-1 rounded-md hover:bg-muted transition-colors"
              title={showRevenue ? 'Ocultar valor' : 'Mostrar valor'}
            >
              {showRevenue ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Pedidos recebidos do dia</h2>
          <Column
            title="Aguardando confirmação"
            icon={<Inbox className="w-4 h-4 text-primary" />}
            orders={agenda.received}
            empty="Nenhum pedido aguardando confirmação."
            paperSize={paperSize}
            storeName={storeName}
          />
        </section>
        <section className="space-y-5">
          <h2 className="text-lg font-bold">Agendamentos do dia</h2>
          <Column
            title="Entregas"
            icon={<Truck className="w-4 h-4 text-primary" />}
            orders={agenda.deliveries}
            empty="Nenhuma entrega agendada para hoje."
            paperSize={paperSize}
            storeName={storeName}
          />
          <Column
            title="Retiradas na loja"
            icon={<Store className="w-4 h-4 text-primary" />}
            orders={agenda.pickups}
            empty="Nenhuma retirada agendada para hoje."
            paperSize={paperSize}
            storeName={storeName}
          />
        </section>
      </div>

      <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              Agenda de hoje
            </DialogTitle>
            <DialogDescription className="sr-only">Resumo dos pedidos agendados para hoje</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-base">
            <p className="font-semibold">
              Você tem {scheduled.total} {scheduled.total === 1 ? 'pedido agendado' : 'pedidos agendados'} para hoje
            </p>
            <p className="flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> {scheduled.delivery} para entrega</p>
            <p className="flex items-center gap-2"><Store className="w-4 h-4 text-primary" /> {scheduled.pickup} para retirada na loja</p>
          </div>
          <Button onClick={() => setNoticeOpen(false)} className="w-full">Entendi</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
