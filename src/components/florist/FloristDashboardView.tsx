import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, CheckCircle, Truck, CalendarDays, TrendingUp, DollarSign, Eye, EyeOff, Store, Inbox, X } from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { OrderCard } from '@/components/OrderCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Order } from '@/types/order';
import { buildFloristAgenda, countScheduledToday, toSPDate, getOrderSchedule, getFloristAgendaSlots, normalizeFloristSlot } from '@/lib/floristAgenda';
import { useFloristRevenueToday } from '@/hooks/useFloristRevenueToday';
import { formatPrice } from '@/lib/utils';

interface Props {
  orders: Order[];
  companyId?: string;
  paperSize?: '58mm' | '80mm';
  storeName?: string;
  /** Só dispara a notificação diária depois que os pedidos terminaram de carregar. */
  ordersLoaded?: boolean;
}

function OrderList({ orders, empty, paperSize, storeName, scheduled = false }: {
  orders: Order[]; empty: string; scheduled?: boolean;
  paperSize?: '58mm' | '80mm'; storeName?: string;
}) {
  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const schedule = getOrderSchedule(o);
            return <OrderCard key={o.id} order={o} paperSize={paperSize} storeName={storeName}
              headerExtra={
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="gap-1">
                    {schedule.mode === 'delivery' ? <Truck className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                    {schedule.mode === 'delivery' ? 'Entrega' : 'Retirada na loja'}
                  </Badge>
                  {scheduled && <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 font-bold text-primary">
                    <Clock className="h-3 w-3" />
                    {schedule.date.split('-').reverse().join('/')} · {schedule.slot || 'Sem turno'}
                  </Badge>}
                </span>
              }
            />;
          })}
        </div>
      )}
    </div>
  );
}

export function FloristDashboardView({ orders, companyId, paperSize, storeName }: Props) {
  const today = toSPDate(new Date());
  const [showRevenue, setShowRevenue] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [slotFilter, setSlotFilter] = useState('');
  const selectedDate = dateFilter ?? today;

  const todayOrders = useMemo(
    () => orders.filter((o) => toSPDate(new Date(o.createdAt)) === today),
    [orders, today],
  );
  const agenda = useMemo(() => buildFloristAgenda(orders, today, { date: selectedDate, slot: slotFilter }), [orders, today, selectedDate, slotFilter]);
  const slots = useMemo(() => getFloristAgendaSlots(orders), [orders]);
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

  // Notificação some sozinha após 5s; passar o mouse em cima pausa o timer.
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearNoticeTimer = () => {
    if (noticeTimer.current) { clearTimeout(noticeTimer.current); noticeTimer.current = null; }
  };
  const startNoticeTimer = () => {
    clearNoticeTimer();
    noticeTimer.current = setTimeout(() => setNoticeOpen(false), 5000);
  };
  useEffect(() => {
    if (noticeOpen) startNoticeTimer();
    return clearNoticeTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeOpen]);

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
            <Button variant="ghost" size="icon"
              onClick={() => setShowRevenue((p) => !p)}
              className="p-1 rounded-md hover:bg-muted transition-colors"
              title={showRevenue ? 'Ocultar valor' : 'Mostrar valor'}
              aria-label={showRevenue ? 'Ocultar valor' : 'Mostrar valor'}
            >
              {showRevenue ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </Button>
          }
        />
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <section className="min-w-0 border-l-4 border-border bg-muted/20" aria-labelledby="florist-received-heading">
          <header className="flex items-center gap-3 border-b border-border bg-muted px-4 py-4">
            <Inbox className="h-6 w-6 shrink-0 text-primary" />
            <h2 id="florist-received-heading" className="min-w-0 text-xl font-bold">Pedidos Recebidos do Dia</h2>
            <Badge variant="secondary" className="ml-auto shrink-0 tabular-nums">{agenda.received.length}</Badge>
          </header>
          <div className="p-4">
          <OrderList
            orders={agenda.received}
            empty="Nenhum pedido aguardando confirmação."
            paperSize={paperSize}
            storeName={storeName}
          />
          </div>
        </section>
        <section className="min-w-0 border-l-4 border-primary bg-primary/5" aria-labelledby="florist-agenda-heading">
          <header className="flex items-center gap-3 border-b border-primary/20 bg-primary/10 px-4 py-4">
            <CalendarDays className="h-6 w-6 shrink-0 text-primary" />
            <h2 id="florist-agenda-heading" className="min-w-0 text-xl font-bold text-primary">Agendamentos do Dia</h2>
            <Badge className="ml-auto shrink-0 tabular-nums">{agenda.scheduled.length}</Badge>
          </header>
          <div className="flex flex-wrap items-end gap-3 border-b border-primary/20 p-4">
            <div className="min-w-0 flex-1 basis-36 space-y-1.5">
              <label htmlFor="florist-agenda-date" className="text-sm font-semibold">Data</label>
              <Input id="florist-agenda-date" type="date" value={selectedDate} onChange={(e) => setDateFilter(e.target.value)} />
            </div>
            <div className="min-w-0 flex-1 basis-40 space-y-1.5">
              <label id="florist-agenda-slot-label" className="text-sm font-semibold">Turno</label>
              <Select value={slotFilter || 'all'} onValueChange={(value) => setSlotFilter(value === 'all' ? '' : value)}>
                <SelectTrigger aria-labelledby="florist-agenda-slot-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os turnos</SelectItem>
                  {slots.map((slot) => <SelectItem key={normalizeFloristSlot(slot)} value={normalizeFloristSlot(slot)}>{slot}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant={selectedDate === today ? 'default' : 'outline'} onClick={() => setDateFilter(null)}>Hoje</Button>
              <Button variant={selectedDate === '' ? 'default' : 'outline'} onClick={() => setDateFilter('')}>Todas as datas</Button>
            </div>
          </div>
          <div className="p-4">
          <OrderList
            orders={agenda.scheduled}
            scheduled
            empty="Nenhum agendamento para os filtros selecionados."
            paperSize={paperSize}
            storeName={storeName}
          />
          </div>
        </section>
      </div>

      {noticeOpen && (
        <div
          role="status"
          onMouseEnter={clearNoticeTimer}
          onMouseLeave={startNoticeTimer}
          className="fixed bottom-6 right-6 z-50 w-80 max-w-[calc(100vw-3rem)] rounded-xl border border-border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-5 fade-in duration-300"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-2 font-bold">
              <CalendarDays className="w-5 h-5 text-primary" />
              Agenda de hoje
            </p>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setNoticeOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            <p className="font-semibold">
              Você tem {scheduled.total} {scheduled.total === 1 ? 'pedido agendado' : 'pedidos agendados'} para hoje
            </p>
            <p className="flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> {scheduled.delivery} para entrega</p>
            <p className="flex items-center gap-2"><Store className="w-4 h-4 text-primary" /> {scheduled.pickup} para retirada na loja</p>
          </div>
        </div>
      )}
    </div>
  );
}
