import { supabase } from '@/integrations/supabase/client';
import {
  generateProductionTicketHTML,
  type OrderTicketType,
  type PrintLayoutVersion,
} from '@/utils/printProductionTicket';

export interface RoutablePrintItem {
  productName: string;
  quantity: number;
  notes?: string | null;
  description?: string | null;
  groupedOptionals?: { groupName: string; items: string }[];
  categoryId?: string | null;
}

export interface ProductionTicketBase {
  tabNumber: number;
  tableNumber?: number;
  customerName?: string | null;
  createdAt: Date;
  paperSize?: '58mm' | '80mm';
  referenceLabel?: string;
  layout?: PrintLayoutVersion;
  companyId?: string;
  orderType?: OrderTicketType;
  showReadyTime?: boolean;
  readyOffsetMinutes?: number;
  deliveryAddress?: string | null;
}

interface PrintStationRow {
  id: string;
  name: string;
  is_default: boolean;
  active: boolean;
}

interface CategoryMapRow {
  category_id: string;
  station_id: string;
}

async function loadRouting(companyId: string) {
  const [{ data: stations }, { data: mappings }] = await Promise.all([
    supabase
      .from('print_stations' as never)
      .select('id, name, is_default, active')
      .eq('company_id', companyId)
      .eq('active', true),
    supabase
      .from('category_print_stations' as never)
      .select('category_id, station_id')
      .eq('company_id', companyId),
  ]);

  const activeStations = (stations ?? []) as PrintStationRow[];
  const categoryToStation = new Map<string, string>();
  for (const m of (mappings ?? []) as CategoryMapRow[]) {
    categoryToStation.set(m.category_id, m.station_id);
  }
  const defaultStation = activeStations.find((s) => s.is_default) ?? activeStations[0] ?? null;

  return { activeStations, categoryToStation, defaultStation };
}

function resolveStationId(
  categoryId: string | null | undefined,
  categoryToStation: Map<string, string>,
  defaultStationId: string | null,
): string | null {
  if (categoryId && categoryToStation.has(categoryId)) {
    return categoryToStation.get(categoryId)!;
  }
  return defaultStationId;
}

function groupItemsByStation(
  items: RoutablePrintItem[],
  categoryToStation: Map<string, string>,
  defaultStationId: string | null,
): Map<string | null, RoutablePrintItem[]> {
  const groups = new Map<string | null, RoutablePrintItem[]>();
  for (const item of items) {
    const stationId = resolveStationId(item.categoryId, categoryToStation, defaultStationId);
    const list = groups.get(stationId) ?? [];
    list.push(item);
    groups.set(stationId, list);
  }
  return groups;
}

function stripCategoryId(item: RoutablePrintItem) {
  const { categoryId: _c, ...rest } = item;
  return rest;
}

/** Enfileira comanda(s) de produção — split por estação quando configurado. */
export async function enqueueProductionByStation(params: {
  companyId: string;
  items: RoutablePrintItem[];
  ticketBase: ProductionTicketBase;
  labelPrefix: string;
  sourceOrderId?: string;
}): Promise<number> {
  const { companyId, items, ticketBase, labelPrefix, sourceOrderId } = params;
  if (!items.length) return 0;

  const { activeStations, categoryToStation, defaultStation } = await loadRouting(companyId);
  const stationNameById = new Map(activeStations.map((s) => [s.id, s.name]));

  const insertJob = async (
    stationItems: RoutablePrintItem[],
    stationId: string | null,
    stationLabel: string,
  ) => {
    const ref = ticketBase.referenceLabel
      ? `${ticketBase.referenceLabel} — ${stationLabel}`
      : stationLabel;

    const html = generateProductionTicketHTML({
      ...ticketBase,
      items: stationItems.map(stripCategoryId),
      referenceLabel: ref,
    });

    const { error } = await supabase.from('print_queue').insert({
      company_id: companyId,
      html_content: html,
      label: `${labelPrefix} (${stationLabel})`,
      station_id: stationId,
      job_type: 'production',
      source_order_id: sourceOrderId ?? null,
    } as never);
    if (error) throw error;
  };

  if (activeStations.length === 0) {
    const html = generateProductionTicketHTML({
      ...ticketBase,
      items: items.map(stripCategoryId),
    });
    const { error } = await supabase.from('print_queue').insert({
      company_id: companyId,
      html_content: html,
      label: labelPrefix,
      job_type: 'production',
      source_order_id: sourceOrderId ?? null,
    } as never);
    if (error) throw error;
    return 1;
  }

  const groups = groupItemsByStation(items, categoryToStation, defaultStation?.id ?? null);
  let count = 0;
  for (const [stationId, stationItems] of groups) {
    if (!stationItems.length) continue;
    const stationLabel = stationId ? (stationNameById.get(stationId) ?? 'Estação') : 'Geral';
    await insertJob(stationItems, stationId, stationLabel);
    count += 1;
  }
  return count;
}

/** Recibo completo → estação que recebe recibos (handles_receipt) ou padrão. */
export async function enqueueReceiptJob(params: {
  companyId: string;
  html: string;
  label: string;
  sourceOrderId?: string;
}) {
  const { companyId, html, label, sourceOrderId } = params;
  const { data: stations } = await supabase
    .from('print_stations' as never)
    .select('id')
    .eq('company_id', companyId)
    .eq('handles_receipt', true)
    .eq('active', true)
    .limit(1);

  const receiptStation = (stations as { id: string }[] | null)?.[0]?.id ?? null;

  const { error } = await supabase.from('print_queue').insert({
    company_id: companyId,
    html_content: html,
    label,
    station_id: receiptStation,
    job_type: 'receipt',
    source_order_id: sourceOrderId ?? null,
  } as never);
  if (error) throw error;
}
