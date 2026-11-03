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
    const first = deliveries[0];
    if (first.date) return { mode: 'delivery', date: first.date, slot: first.slot || '' };
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
  scheduled: Order[];
  deliveries: Order[];
  pickups: Order[];
}

export interface FloristAgendaFilters {
  /** Empty means all dates. */
  date: string;
  /** Empty means all slots. */
  slot: string;
}

export function normalizeFloristSlot(slot: string): string {
  return slot.trim().replace(/\s+/g, '').replace(/[–—]/g, '-');
}

function slotStart(slot: string): number {
  const match = slot.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

export function getFloristAgendaSlots(orders: Order[], date = ''): string[] {
  const slots = new Map<string, string>();
  for (const order of orders) {
    if (isCancelled(order) || order.status === 'delivered' || (!order.confirmedAt && order.status === 'pending')) continue;
    const schedule = getOrderSchedule(order);
    if ((date && schedule.date !== date) || !schedule.slot) continue;
    slots.set(normalizeFloristSlot(schedule.slot), schedule.slot);
  }
  return [...slots.values()].sort((a, b) => slotStart(a) - slotStart(b));
}

/**
 * - Recebidos: pedidos pendentes (aguardando confirmação).
 * - Agendamentos: confirmados/prontos com agendamento para hoje (ou atrasados), ordenados por horário.
 * Entregues e cancelados não aparecem.
 */
export function buildFloristAgenda(orders: Order[], today: string, filters?: FloristAgendaFilters): FloristAgenda {
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
    const matchesDate = filters ? !filters.date || s.date === filters.date : s.date <= today;
    const matchesSlot = !filters?.slot || normalizeFloristSlot(s.slot) === normalizeFloristSlot(filters.slot);
    if (matchesDate && matchesSlot) scheduled.push({ o, s });
  }
  scheduled.sort((a, b) =>
    a.s.date.localeCompare(b.s.date) ||
    slotStart(a.s.slot) - slotStart(b.s.slot) ||
    new Date(a.o.createdAt).getTime() - new Date(b.o.createdAt).getTime()
  );
  received.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    received,
    scheduled: scheduled.map((x) => x.o),
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
