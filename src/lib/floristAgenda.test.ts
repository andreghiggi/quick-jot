import { describe, it, expect } from 'vitest';
import { floristNextStatus, buildFloristAgenda, countScheduledToday, getFloristAgendaSlots } from './floristAgenda';
import type { Order } from '@/types/order';

const mk = (id: string, status: Order['status'], notes: string, confirmed = true): Order => ({
  id, dailyNumber: 1, orderCode: id, customerName: 'X', total: 10, status,
  createdAt: new Date('2026-10-29T12:00:00-03:00'),
  confirmedAt: confirmed ? new Date() : undefined,
  items: [{ id: 'i', productId: 'p', name: 'Buquê', quantity: 1, price: 10, notes }],
});

describe('floricultura: filtros e fila única', () => {
  const today = '2026-10-29';
  const orders = [
    { ...mk('depois', 'ready', ENTREGA('29/10/2026', '14:00–16:00')), createdAt: new Date('2026-10-29T10:00:00-03:00') },
    mk('amanha', 'ready', ENTREGA('30/10/2026', '08:00–10:00')),
    { ...mk('antes', 'pending', ENTREGA('29/10/2026', '14:00–16:00')), createdAt: new Date('2026-10-29T09:00:00-03:00') },
    mk('manha', 'ready', ENTREGA('29/10/2026', '08:00–10:00')),
    mk('retira', 'ready', 'DESTINO 1: Para o comprador | Retirada na loja'),
    mk('entregue', 'delivered', ENTREGA('29/10/2026', '08:00–10:00')),
    mk('cancelado', 'canceled', ENTREGA('29/10/2026', '08:00–10:00')),
    mk('nao-confirmado', 'pending', ENTREGA('29/10/2026', '08:00–10:00'), false),
  ];
  it('ordena primeiro por data e depois pelo início do turno', () => {
    expect(buildFloristAgenda(orders, today, { date: '', slot: '' }).scheduled.map(o => o.id))
      .toEqual(['manha', 'antes', 'depois', 'retira', 'amanha']);
  });
  it('no mesmo dia e turno, o primeiro a entrar no sistema aparece primeiro', () => {
    expect(buildFloristAgenda(orders, today, { date: today, slot: '14:00–16:00' }).scheduled.map(o => o.id))
      .toEqual(['antes', 'depois']);
  });
  it('filtra somente por data sem limitar o turno', () => {
    expect(buildFloristAgenda(orders, today, { date: '2026-10-30', slot: '' }).scheduled.map(o => o.id)).toEqual(['amanha']);
  });
  it('filtra somente por turno em todas as datas', () => {
    expect(buildFloristAgenda(orders, today, { date: '', slot: '08:00-10:00' }).scheduled.map(o => o.id)).toEqual(['manha', 'amanha']);
  });
  it('combina data e turno', () => {
    expect(buildFloristAgenda(orders, today, { date: today, slot: '08:00–10:00' }).scheduled.map(o => o.id)).toEqual(['manha']);
  });
  it('mantém entregas e retiradas na mesma lista', () => {
    expect(buildFloristAgenda(orders, today, { date: today, slot: '' }).scheduled.map(o => o.id))
      .toEqual(['manha', 'antes', 'depois', 'retira']);
  });
  it('não inclui entregues, cancelados ou pedidos sem confirmação na agenda', () => {
    const ids = buildFloristAgenda(orders, today, { date: '', slot: '' }).scheduled.map(o => o.id);
    expect(ids).not.toContain('entregue');
    expect(ids).not.toContain('cancelado');
    expect(ids).not.toContain('nao-confirmado');
  });
  it('mostra apenas turnos de pedidos ativos confirmados', () => {
    expect(getFloristAgendaSlots(orders)).toEqual(['08:00–10:00', '14:00–16:00']);
  });
});
const ENTREGA = (d: string, slot: string) => `DESTINO 1: PRESENTE | Entrega ${d} ${slot} | Recebe: Ana (54999) | Endereço: Rua A, 1 - Centro`;

describe('floricultura: fluxo sem Preparar', () => {
  it('pendente vai direto para pronto', () => expect(floristNextStatus('pending')).toBe('ready'));
  it('pronto vai para entregue', () => expect(floristNextStatus('ready')).toBe('delivered'));
  it('entregue não avança', () => expect(floristNextStatus('delivered')).toBeUndefined());
});

describe('floricultura: agenda do dia', () => {
  const today = '2026-10-29';
  const orders = [
    mk('novo', 'pending', ENTREGA('29/10/2026', '16:00–18:00'), false),
    mk('tarde', 'pending', ENTREGA('29/10/2026', '16:00–18:00')),
    mk('manha', 'ready', ENTREGA('29/10/2026', '08:00–10:00')),
    mk('retira', 'pending', 'DESTINO 1: Para o comprador | Retirada na loja'),
    mk('amanha', 'pending', ENTREGA('30/10/2026', '08:00–10:00')),
    mk('feito', 'delivered', ENTREGA('29/10/2026', '08:00–10:00')),
  ];
  it('não confirmado fica em recebidos; confirmados vão para agendamentos por horário', () => {
    const a = buildFloristAgenda(orders, today);
    expect(a.received.map((o) => o.id)).toEqual(['novo']);
    expect(a.deliveries.map((o) => o.id)).toEqual(['manha', 'tarde']);
    expect(a.pickups.map((o) => o.id)).toEqual(['retira']);
  });
  it('contagem do aviso diário separa entrega e retirada', () => {
    expect(countScheduledToday(orders, today)).toEqual({ total: 5, delivery: 4, pickup: 1 });
  });
});
