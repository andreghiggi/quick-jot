// Regras de pedidos para o mesmo dia — SOMENTE perfil floricultura.
// Fica em store_settings (uma chave JSON por loja); não altera turnos nem horários semanais.
import { supabase } from '@/integrations/supabase/client';

export const FLORIST_SAME_DAY_KEY = 'florist_same_day';
const TZ = 'America/Sao_Paulo';

export interface FloristSameDayConfig {
  /** Prazo para retirada na loja, em minutos (30 em 30, de 30 min a 6h). */
  pickupMinutes: number;
  /** false = a loja nunca entrega no mesmo dia. */
  sameDayDelivery: boolean;
  /** Antecedência mínima entre o pedido e o início do turno, em minutos. */
  leadMinutes: number;
  /** Dia (YYYY-MM-DD) em que a loja encerrou as entregas; volta sozinho no dia seguinte. */
  closedDate: string | null;
}

/** 30 min, 1h, 1h30 ... 6h */
export const PICKUP_MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 30);
/** 1h, 2h ... 6h */
export const LEAD_MINUTE_OPTIONS = Array.from({ length: 6 }, (_, i) => (i + 1) * 60);

export const DEFAULT_SAME_DAY: FloristSameDayConfig = {
  pickupMinutes: 60,
  sameDayDelivery: true,
  leadMinutes: 120,
  closedDate: null,
};

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutos`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m) return `${h}h${String(m).padStart(2, '0')}`;
  return h === 1 ? '1 hora' : `${h} horas`;
}

export function parseSameDayConfig(value: unknown): FloristSameDayConfig {
  let raw: any = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SAME_DAY };
  return {
    pickupMinutes: PICKUP_MINUTE_OPTIONS.includes(raw.pickupMinutes) ? raw.pickupMinutes : DEFAULT_SAME_DAY.pickupMinutes,
    sameDayDelivery: raw.sameDayDelivery !== false,
    leadMinutes: LEAD_MINUTE_OPTIONS.includes(raw.leadMinutes) ? raw.leadMinutes : DEFAULT_SAME_DAY.leadMinutes,
    closedDate: typeof raw.closedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.closedDate) ? raw.closedDate : null,
  };
}

export const spDate = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: TZ });

export function spMinutes(now = new Date()): number {
  const [h, m] = now.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
  return h * 60 + m;
}

/** A loja ainda aceita entrega para hoje? (independe de haver turno restante) */
export function acceptsDeliveryToday(config: FloristSameDayConfig, now = new Date()): boolean {
  return config.sameDayDelivery && config.closedDate !== spDate(now);
}

const slotStart = (label: string): number => {
  const m = label.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.MAX_SAFE_INTEGER;
};

/**
 * Turnos que o cliente pode escolher para a data.
 * Datas futuras não são filtradas. Para hoje: só turnos que começam depois de agora + antecedência.
 * Datas passadas não têm turno.
 */
export function selectableSlots(slots: string[], date: string, config: FloristSameDayConfig, now = new Date()): string[] {
  const today = spDate(now);
  if (date > today) return slots;
  if (date < today || !acceptsDeliveryToday(config, now)) return [];
  const earliest = spMinutes(now) + config.leadMinutes;
  return slots.filter((s) => slotStart(s) >= earliest);
}

export function pickupNotice(config: FloristSameDayConfig): string {
  return `Disponível para retirada na loja em aproximadamente ${formatDuration(config.pickupMinutes)}. AGUARDE A MENSAGEM DE CONFIRMAÇÃO PARA RETIRADA.`;
}

export async function fetchSameDayConfig(companyId: string): Promise<FloristSameDayConfig> {
  const { data, error } = await supabase.from('store_settings').select('value')
    .eq('company_id', companyId).eq('key', FLORIST_SAME_DAY_KEY).maybeSingle();
  if (error) throw error;
  return parseSameDayConfig(data?.value);
}

export async function saveSameDayConfig(companyId: string, config: FloristSameDayConfig): Promise<FloristSameDayConfig> {
  const { data, error } = await supabase.from('store_settings').upsert({
    company_id: companyId, key: FLORIST_SAME_DAY_KEY, value: JSON.stringify(config), updated_at: new Date().toISOString(),
  }, { onConflict: 'key,company_id' }).select('value').single();
  if (error || !data) throw error || new Error('Gravação não confirmada');
  return parseSameDayConfig(data.value);
}
