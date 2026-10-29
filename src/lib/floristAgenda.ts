// Agenda do dia para lojas com perfil floricultura.
// Usado SOMENTE quando o perfil floricultura está ativo na loja.
import type { Order, OrderStatus } from '@/types/order';
import { parseDestinationFromNotes } from './floristDestination';

export interface FloristSchedule {
  mode: 'delivery' | 'pickup';
  /** YYYY-MM-DD */
  date: string;
  /** Texto do turno (ex.: "14:00–16:00"); vazio quando não informado. */
  slot: string;
}

export function toSPDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Lê o agendamento do pedido a partir dos itens. Entrega prevalece sobre retirada;
 * a data/turno mais cedo é usada. Retirada sem data vale para o dia do pedido.
 */
export function getOrderSchedule(order: Pick<Order, 'items' | 'createdAt'>): FloristSchedule {
  const dests = (order.items || [])
    .map((it) => parseDestinationFromNotes(it.notes).destination)
    .filter((d): d is NonNullable<typeof d> => !!d);
  const deliveries = dests
    .filter((d) => d.mode === 'delivery' && d.date)
    .sort((a, b) => `${a.date}${a.slot || ''}`.localeCompare(`${b.date}${b.slot || ''}`));
  if (deliveries.length) {
    return { mode: 'delivery', date: deliveries[0].date!, slot: deliveries[0].slot || '' };
  }
  return { mode: 'pickup', date: toSPDate(new Date(order.createdAt)), slot: '' };
}

/** Próximo status do botão de avanço no perfil floricultura (sem "Preparar"). */
export function floristNextStatus(status: OrderStatus): OrderStatus | undefined {
  if (status === 'pending' || status === 'preparing') return 'ready';
  if (status === 'ready') return 'delivered';
  return undefined;
}

function isCancelled(o: Order) {
  return o.status === 'canceled' || (o.status as string) === 'cancelled' || !!o.notes?.includes('[CANCELADA]');
}

export interface FloristAgenda {
  received: Order[];
  deliveries: Order[];
  pickups: Order[];
}

/**
 * - Recebidos: pedidos pendentes (aguardando confirmação).
 * - Agendamentos: confirmados/prontos com agendamento para hoje (ou atrasados), ordenados por horário.
 * Entregues e cancelados não aparecem.
 */
export function buildFloristAgenda(orders: Order[], today: string): FloristAgenda {
  const received: Order[] = [];
  const scheduled: { o: Order; s: FloristSchedule }[] = [];
  for (const o of orders) {
    if (isCancelled(o) || o.status === 'delivered') continue;
    const confirmed = !!o.confirmedAt || o.status !== 'pending';
    if (!confirmed) {
      if (toSPDate(new Date(o.createdAt)) === today) received.push(o);
      continue;
    }
    const s = getOrderSchedule(o);
    if (s.date <= today) scheduled.push({ o, s });
  }
  const sortKey = (x: { o: Order; s: FloristSchedule }) =>
    `${x.s.date}${x.s.slot || '99:99'}${new Date(x.o.createdAt).toISOString()}`;
  scheduled.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  received.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    received,
    deliveries: scheduled.filter((x) => x.s.mode === 'delivery').map((x) => x.o),
    pickups: scheduled.filter((x) => x.s.mode === 'pickup').map((x) => x.o),
  };
}

/** Contagem de pedidos agendados para hoje (não cancelados), por modalidade. */
export function countScheduledToday(orders: Order[], today: string) {
  let delivery = 0;
  let pickup = 0;
  for (const o of orders) {
    if (isCancelled(o)) continue;
    const s = getOrderSchedule(o);
    if (s.date !== today) continue;
    if (s.mode === 'delivery') delivery++;
    else pickup++;
  }
  return { total: delivery + pickup, delivery, pickup };
}
