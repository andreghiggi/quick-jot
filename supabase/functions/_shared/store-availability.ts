// One exceptional day, independent of cash registers and the weekly timetable.
export const STORE_AVAILABILITY_KEY = 'store_availability_override';
export interface StoreAvailabilityOverride { mode: 'open' | 'closed'; date: string }
export function storeLocalDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function activeStoreOverride(value: unknown, now = new Date()): StoreAvailabilityOverride | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || !('mode' in parsed) || !('date' in parsed)) return null;
    if ((parsed.mode !== 'open' && parsed.mode !== 'closed') || parsed.date !== storeLocalDate(now)) return null;
    return { mode: parsed.mode, date: String(parsed.date) };
  } catch { return null; }
}
export function effectiveStoreOpen(scheduledOpen: boolean, value: unknown, now = new Date()): boolean {
  const override = activeStoreOverride(value, now);
  return override ? override.mode === 'open' : scheduledOpen;
}
export function effectiveSchedulingToday(scheduled: boolean, value: unknown, now = new Date()): boolean {
  return activeStoreOverride(value, now) ? false : scheduled;
}
export function newStoreOverride(open: boolean, now = new Date()): StoreAvailabilityOverride {
  return { mode: open ? 'open' : 'closed', date: storeLocalDate(now) };
}
export async function readStoreOverride(db: any, companyId: string): Promise<string | null> {
  const { data, error } = await db.from('store_settings').select('value')
    .eq('company_id', companyId).eq('key', STORE_AVAILABILITY_KEY).maybeSingle();
  if (error) throw new Error('Não foi possível consultar o estado da loja');
  return data?.value ?? null;
}