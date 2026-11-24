import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import {
  DEFAULT_SAME_DAY, PICKUP_MINUTE_OPTIONS, acceptsDeliveryToday, formatDuration,
  parseSameDayConfig, pickupNotice, selectableSlots,
  withDeliveryToday,
} from './floristSameDay';
import { getSlotsForDate } from './floristShifts';

// 24/11/2026 16:00 em São Paulo (UTC-3)
const at = (hhmm: string) => new Date(`2026-11-24T${hhmm}:00-03:00`);
const hourly = getSlotsForDate([], '2026-11-24');
const cfg = (patch = {}) => ({ ...DEFAULT_SAME_DAY, ...patch });

describe('prazo de retirada', () => {
  it('opções vão de 30 em 30 minutos, de 30 min até 6h', () => {
    expect(PICKUP_MINUTE_OPTIONS).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360]);
  });
  it('formata os prazos', () => {
    expect([30, 60, 90, 120, 360].map(formatDuration)).toEqual(['30 minutos', '1 hora', '1h30', '2 horas', '6 horas']);
  });
  it('aviso do catálogo usa o prazo escolhido', () => {
    expect(pickupNotice(cfg({ pickupMinutes: 60 }))).toBe(
      'Disponível para retirada na loja em aproximadamente 1 hora. AGUARDE A MENSAGEM DE CONFIRMAÇÃO PARA RETIRADA.');
  });
  it('valor fora da lista (texto livre) volta ao padrão', () => {
    expect(parseSameDayConfig('{"pickupMinutes":45}').pickupMinutes).toBe(60);
    expect(parseSameDayConfig('lixo')).toEqual(DEFAULT_SAME_DAY);
  });
});

describe('turnos de hora em hora', () => {
  it('grade padrão é de 1 em 1 hora, das 08h às 19h', () => {
    expect(hourly[0]).toBe('08:00–09:00');
    expect(hourly[hourly.length - 1]).toBe('18:00–19:00');
    expect(hourly).toHaveLength(11);
  });
});

describe('entrega no mesmo dia', () => {
  it('controle rápido encerra apenas as entregas de hoje, preservando os prazos', () => {
    const closed = withDeliveryToday(cfg({ pickupMinutes: 90, leadMinutes: 180 }), false, at('16:00'));
    expect(closed).toEqual({ pickupMinutes: 90, leadMinutes: 180, sameDayDelivery: true, closedDate: '2026-11-24' });
    expect(selectableSlots(hourly, '2026-11-24', closed, at('08:00'))).toEqual([]);
    expect(selectableSlots(hourly, '2026-11-25', closed, at('08:00'))).toEqual(hourly);
  });
  it('controle rápido reabre hoje sem mudar a antecedência e a retirada', () => {
    const reopened = withDeliveryToday(cfg({ pickupMinutes: 120, leadMinutes: 60, closedDate: '2026-11-24' }), true, at('16:00'));
    expect(reopened).toEqual({ pickupMinutes: 120, leadMinutes: 60, sameDayDelivery: true, closedDate: null });
    expect(selectableSlots(hourly, '2026-11-24', reopened, at('16:00'))).toEqual(['17:00–18:00', '18:00–19:00']);
  });
  it('controle não sobrepõe a regra permanente de não entregar no mesmo dia', () => {
    expect(() => withDeliveryToday(cfg({ sameDayDelivery: false }), true, at('16:00'))).toThrow();
  });
  it('encerramento pelo controle usa o dia local e expira à meia-noite de São Paulo', () => {
    const closed = withDeliveryToday(cfg(), false, new Date('2026-11-25T02:59:00Z'));
    expect(closed.closedDate).toBe('2026-11-24');
    expect(acceptsDeliveryToday(closed, new Date('2026-11-25T02:59:00Z'))).toBe(false);
    expect(acceptsDeliveryToday(closed, new Date('2026-11-25T03:00:00Z'))).toBe(true);
  });
  it('pedido às 16h com 1h de antecedência: primeiro turno é 17h', () => {
    expect(selectableSlots(hourly, '2026-11-24', cfg({ leadMinutes: 60 }), at('16:00'))).toEqual(['17:00–18:00', '18:00–19:00']);
  });
  it('pedido às 16h com 2h de antecedência: primeiro turno é 18h', () => {
    expect(selectableSlots(hourly, '2026-11-24', cfg({ leadMinutes: 120 }), at('16:00'))).toEqual(['18:00–19:00']);
  });
  it('sem turno viável hoje não oferece nenhum', () => {
    expect(selectableSlots(hourly, '2026-11-24', cfg({ leadMinutes: 180 }), at('16:30'))).toEqual([]);
  });
  it('loja que não entrega no mesmo dia não oferece turnos hoje', () => {
    expect(selectableSlots(hourly, '2026-11-24', cfg({ sameDayDelivery: false }), at('08:00'))).toEqual([]);
  });
  it('entregas encerradas hoje voltam sozinhas no dia seguinte', () => {
    const closed = cfg({ closedDate: '2026-11-24' });
    expect(acceptsDeliveryToday(closed, at('10:00'))).toBe(false);
    expect(selectableSlots(hourly, '2026-11-24', closed, at('10:00'))).toEqual([]);
    expect(acceptsDeliveryToday(closed, new Date('2026-11-25T08:00:00-03:00'))).toBe(true);
  });
  it('datas futuras mantêm todos os turnos', () => {
    expect(selectableSlots(hourly, '2026-11-25', cfg({ sameDayDelivery: false, closedDate: '2026-11-24' }), at('23:00'))).toEqual(hourly);
  });
  it('usa o dia de São Paulo, não o UTC', () => {
    // 22:00 em SP já é dia 25 em UTC
    expect(selectableSlots(hourly, '2026-11-25', cfg(), at('22:00'))).toEqual(hourly);
    expect(selectableSlots(hourly, '2026-11-24', cfg(), at('22:00'))).toEqual([]);
  });
});
