import { parseDestinationFromNotes, type FloristDestination } from './florist-destination.ts';

export type StageStatus = 'pending' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'picked_up';
export interface PersistedStage { id: string; mode: 'pickup' | 'delivery'; itemIds: string[]; status: StageStatus; updatedAt?: string }
export interface FloralItem { id: string; name: string; quantity: number; notes?: string | null }
export interface FloralOrder { items: FloralItem[]; deliveryAddress?: string | null; customerName?: string; createdAt: Date | string; stages?: PersistedStage[] }
export interface FloralStage extends PersistedStage { items: FloralItem[]; destination: FloristDestination | null; date: string; slot: string; recipientName: string }
export const isStageComplete = (s: Pick<PersistedStage, 'status'>) => s.status === 'delivered' || s.status === 'picked_up';
export const allStagesComplete = (s: PersistedStage[]) => s.length > 0 && s.every(isStageComplete);
export function nextStageStatus(s: Pick<PersistedStage, 'mode' | 'status'>): StageStatus | undefined {
  if (s.mode === 'pickup') {
    if (s.status === 'pending') return 'ready_for_pickup';
    if (s.status === 'ready_for_pickup') return 'picked_up';
  } else {
    if (s.status === 'pending') return 'out_for_delivery';
    if (s.status === 'out_for_delivery') return 'delivered';
  }
}
export function stageIdFromNotes(notes?: string | null): string {
  const match = notes?.match(/DESTINO\s+([0-9]+):/i);
  return match ? `destino-${match[1]}` : 'legacy';
}
export function buildFloralStages(order: FloralOrder): FloralStage[] {
  const groups = new Map<string, FloralItem[]>();
  for (const item of order.items) {
    const key = stageIdFromNotes(item.notes);
    const group = groups.get(key) ?? [];
    group.push(item); groups.set(key, group);
  }
  const today = new Date(order.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return [...groups].map(([id, items]) => {
    const destination = parseDestinationFromNotes(items[0]?.notes).destination;
    const saved = order.stages?.find(s => s.id === id);
    const mode = saved?.mode ?? destination?.mode ?? (order.deliveryAddress ? 'delivery' : 'pickup');
    return { id, mode, itemIds: items.map(i => i.id), status: saved?.status ?? 'pending', updatedAt: saved?.updatedAt,
      items, destination, date: destination?.date || today, slot: destination?.slot || '',
      recipientName: destination?.recipientName || order.customerName || '' };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}