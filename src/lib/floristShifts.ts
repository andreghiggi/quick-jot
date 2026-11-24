// Turnos de entrega por dia da semana — SOMENTE perfil floricultura.
// Se a loja não cadastrou turnos personalizados, vale a grade padrão de hora em hora (08h às 19h).
import { supabase } from '@/integrations/supabase/client';

export interface DeliveryShift {
  id?: string;
  dayOfWeek: number; // 0 = domingo
  label: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  sortOrder: number;
}

export const DAY_NAMES_SHORT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

/** Grade padrão usada quando a loja ainda não personalizou os turnos. */
export const DEFAULT_FLORIST_SHIFTS: Omit<DeliveryShift, 'dayOfWeek'>[] = Array.from({ length: 11 }, (_, i) => {
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const startTime = hh(8 + i);
  const endTime = hh(9 + i);
  return { label: `${startTime}–${endTime}`, startTime, endTime, sortOrder: i };
});

export const shiftLabel = (startTime: string, endTime: string) => `${startTime}–${endTime}`;

/** Agrupa os turnos por dia da semana (0-6), ordenados pelo horário de início. */
export function groupShiftsByDay(shifts: DeliveryShift[]): Map<number, DeliveryShift[]> {
  const map = new Map<number, DeliveryShift[]>();
  for (const s of shifts) {
    const list = map.get(s.dayOfWeek) ?? [];
    list.push(s);
    map.set(s.dayOfWeek, list);
  }
  map.forEach((list) => list.sort((a, b) => a.startTime.localeCompare(b.startTime)));
  return map;
}

/**
 * Rótulos dos turnos disponíveis para uma data (YYYY-MM-DD).
 * - Loja sem nenhum turno cadastrado → grade padrão (compatibilidade).
 * - Loja com turnos cadastrados, mas nenhum no dia da semana da data → [] (sem entrega nesse dia).
 */
export function getSlotsForDate(shifts: DeliveryShift[], dateStr: string): string[] {
  if (shifts.length === 0) return DEFAULT_FLORIST_SHIFTS.map((s) => s.label);
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return (groupShiftsByDay(shifts).get(day) ?? []).map((s) => s.label);
}

/** Minutos do início do turno, para ordenação cronológica na agenda. */
export function slotStartMinutes(label: string): number {
  const m = label.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.MAX_SAFE_INTEGER;
}

interface ShiftRow {
  id: string;
  day_of_week: number;
  label: string;
  start_time: string;
  end_time: string;
  sort_order: number;
}

const rowToShift = (r: ShiftRow): DeliveryShift => ({
  id: r.id,
  dayOfWeek: r.day_of_week,
  label: r.label,
  startTime: r.start_time.slice(0, 5),
  endTime: r.end_time.slice(0, 5),
  sortOrder: r.sort_order,
});

// Cache em memória (30s) para o catálogo público não repetir a consulta a cada item.
const cache = new Map<string, { at: number; shifts: DeliveryShift[] }>();
const CACHE_TTL_MS = 30_000;

/** Busca os turnos cadastrados da loja (catálogo público ou painel). */
export async function fetchDeliveryShifts(companyId: string): Promise<DeliveryShift[]> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.shifts;
  const { data, error } = await supabase
    .from('company_delivery_shifts')
    .select('id, day_of_week, label, start_time, end_time, sort_order')
    .eq('company_id', companyId)
    .order('day_of_week')
    .order('sort_order');
  if (error) return hit?.shifts ?? [];
  const shifts = ((data ?? []) as unknown as ShiftRow[]).map(rowToShift);
  cache.set(companyId, { at: Date.now(), shifts });
  return shifts;
}

export function invalidateDeliveryShiftsCache(companyId: string) {
  cache.delete(companyId);
}

/** Substitui todos os turnos de um dia da semana (apagar tudo + inserir os novos). */
export async function saveDayShifts(companyId: string, dayOfWeek: number, shifts: Omit<DeliveryShift, 'dayOfWeek'>[]): Promise<void> {
  const { error: delError } = await supabase
    .from('company_delivery_shifts')
    .delete()
    .eq('company_id', companyId)
    .eq('day_of_week', dayOfWeek);
  if (delError) throw delError;
  if (shifts.length > 0) {
    const rows = shifts.map((s, i) => ({
      company_id: companyId,
      day_of_week: dayOfWeek,
      label: s.label || shiftLabel(s.startTime, s.endTime),
      start_time: s.startTime,
      end_time: s.endTime,
      sort_order: i,
    }));
    const { error: insError } = await supabase.from('company_delivery_shifts').insert(rows);
    if (insError) throw insError;
  }
  invalidateDeliveryShiftsCache(companyId);
}
