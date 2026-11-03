import { describe, expect, it } from 'bun:test';
import { DeliveryShift, getSlotsForDate, groupShiftsByDay, shiftLabel, slotStartMinutes } from './floristShifts';
import { FLORIST_TIME_SLOTS } from './floristGift';

const shift = (dayOfWeek: number, startTime: string, endTime: string, sortOrder = 0): DeliveryShift => ({
  dayOfWeek,
  label: shiftLabel(startTime, endTime),
  startTime,
  endTime,
  sortOrder,
});

// 2026-11-03 = terça-feira (2); 2026-11-08 = domingo (0)
describe('getSlotsForDate', () => {
  it('loja sem turnos cadastrados usa a grade padrão', () => {
    expect(getSlotsForDate([], '2026-11-03')).toEqual([...FLORIST_TIME_SLOTS]);
  });

  it('retorna os turnos personalizados do dia da semana da data', () => {
    const shifts = [shift(2, '09:00', '11:00'), shift(2, '15:00', '17:00', 1)];
    expect(getSlotsForDate(shifts, '2026-11-03')).toEqual(['09:00–11:00', '15:00–17:00']);
  });

  it('dia da semana sem turno cadastrado não oferece entrega', () => {
    const shifts = [shift(2, '09:00', '11:00')];
    expect(getSlotsForDate(shifts, '2026-11-08')).toEqual([]);
  });

  it('turnos de um dia não vazam para outro dia', () => {
    const shifts = [shift(0, '08:00', '10:00'), shift(2, '14:00', '16:00')];
    expect(getSlotsForDate(shifts, '2026-11-08')).toEqual(['08:00–10:00']);
    expect(getSlotsForDate(shifts, '2026-11-03')).toEqual(['14:00–16:00']);
  });
});

describe('groupShiftsByDay', () => {
  it('ordena os turnos do dia pelo horário de início', () => {
    const grouped = groupShiftsByDay([shift(1, '16:00', '18:00', 1), shift(1, '08:00', '10:00', 0)]);
    expect(grouped.get(1)!.map((s) => s.label)).toEqual(['08:00–10:00', '16:00–18:00']);
  });
});

describe('slotStartMinutes', () => {
  it('converte o início do turno em minutos', () => {
    expect(slotStartMinutes('14:00–16:00')).toBe(840);
    expect(slotStartMinutes('08:30–10:00')).toBe(510);
  });

  it('rótulo inválido vai para o fim da fila', () => {
    expect(slotStartMinutes('sem horário')).toBe(Number.MAX_SAFE_INTEGER);
  });
});
