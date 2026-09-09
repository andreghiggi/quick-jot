import { supabase } from '@/integrations/supabase/client';
import {
  generateProductionTicketHTML,
  type OrderTicketType,
  type PrintLayoutVersion,
} from '@/utils/printProductionTicket';

export interface ProductionJob {
  station_id: string | null;
  items: any[];
}

/**
 * Agrupa uma lista de itens por estação de impressão (via categoria).
 * Mantém a ordem original dos itens dentro de cada grupo.
 *
 * Se a loja não tiver estações/vínculos, retorna um único grupo com
 * `station_id = null` — comportamento idêntico ao fluxo antigo.
 */
export async function groupItemsByStation<T>(
  companyId: string,
  items: T[],
  getCategoryName: (item: T) => string | null | undefined
): Promise<{ station_id: string | null; items: T[] }[]> {
  if (items.length === 0) return [];
  try {
    const [{ data: mappings }, { data: dbCategories }] = await Promise.all([
      supabase
        .from('category_print_stations' as any)
        .select('category_id, station_id')
        .eq('company_id', companyId),
      supabase.from('categories').select('id, name').eq('company_id', companyId),
    ]);

    if (!mappings || mappings.length === 0) {
      return [{ station_id: null, items }];
    }

    const stationByCategoryId: Record<string, string> = {};
    (mappings as any[]).forEach((m) => {
      stationByCategoryId[m.category_id] = m.station_id;
    });
    const categoryIdByName: Record<string, string> = {};
    dbCategories?.forEach((c: any) => {
      categoryIdByName[c.name] = c.id;
    });

    const groups = new Map<string, T[]>();
    items.forEach((item) => {
      const catName = getCategoryName(item);
      const catId = catName ? categoryIdByName[catName] : undefined;
      const stationId = catId ? stationByCategoryId[catId] ?? null : null;
      const key = stationId ?? '__default__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });

    return Array.from(groups.entries()).map(([key, groupItems]) => ({
      station_id: key === '__default__' ? null : key,
      items: groupItems,
    }));
  } catch (e) {
    console.error('[PrintRouting] Falha ao agrupar por estação:', e);
    return [{ station_id: null, items }];
  }
}


async function enqueueProductionByStationLegacy(
  companyId: string,
  orderId: string,
  items: any[],
  orderNumber: string,
  customerName: string,
  orderOrigin: string = 'cardápio'
) {
  try {
    // 1. Fetch category mappings and category settings
    const [{ data: mappings }, { data: dbCategories }] = await Promise.all([
      supabase
        .from('category_print_stations' as any)
        .select('category_id, station_id')
        .eq('company_id', companyId),
      supabase
        .from('categories')
        .select('id, name, production_print')
        .eq('company_id', companyId)
    ]);

    const mappingDict: Record<string, string> = {};
    mappings?.forEach((m: any) => {
      mappingDict[m.category_id] = m.station_id;
    });

    const categoryMapByName: Record<string, { id: string, production_print: boolean }> = {};
    dbCategories?.forEach(c => {
      categoryMapByName[c.name] = { id: c.id, production_print: c.production_print ?? true };
    });

    // 1b. Resolve categoria pelo produto quando o item não trouxer essa info
    const productIds = Array.from(
      new Set(
        items
          .map((i: any) => i.product_id || i.productId || i.product?.id)
          .filter((id: any) => typeof id === 'string' && id.length > 0)
      )
    );

    // `products` guarda apenas o NOME da categoria; o id vem de `categories`.
    const productInfo: Record<string, { category: string | null; category_id: string | null }> = {};
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from('products')
        .select('id, category')
        .in('id', productIds as string[]);
      prods?.forEach((p: any) => {
        const catName = p.category ?? null;
        productInfo[p.id] = {
          category: catName,
          category_id: catName ? (categoryMapByName[catName]?.id ?? null) : null,
        };
      });
    }

    // 2. Group items by station
    const stationGroups: Record<string, any[]> = {};
    const defaultItems: any[] = [];

    items.forEach(item => {
      const productId = item.product_id || (item as any).productId || item.product?.id;
      const prod = productId ? productInfo[productId] : undefined;

      const categoryName = item.category || (item as any).category_name || prod?.category;
      const categoryInfo = categoryName ? categoryMapByName[categoryName] : null;

      // Skip if production print is disabled for this category
      if (categoryInfo && categoryInfo.production_print === false) {
        console.log(`[PrintRouting] Skipping item ${item.name} - production print disabled for category ${categoryName}`);
        return;
      }

      // Find category_id for the item
      const categoryId =
        item.product?.category_id ||
        item.category_id ||
        prod?.category_id ||
        categoryInfo?.id;
      let stationId = categoryId ? mappingDict[categoryId] : null;

      if (stationId) {
        if (!stationGroups[stationId]) stationGroups[stationId] = [];
        stationGroups[stationId].push(item);
      } else {
        defaultItems.push(item);
      }
    });


    // 3. Create jobs (Using HTML generation or JSON as per script requirements)
    const jobs: any[] = [];

    // Helper to format production ticket text (Simple version for script consumption)
    const generateSimpleText = async (items: any[]) => {
      // For V2 layout, we fetch the full HTML from generateProductionTicketHTML
      // but only for the specific items of this station.
      const { generateProductionTicketHTML, parseNotes } = await import('@/utils/printProductionTicket');
      const { computeReadyOffsetMinutes } = await import('@/utils/estimatedReadyOffset');
      
      // Fetch store settings for this company to check print_layout
      const { data: settingsData } = await supabase
        .from('store_settings')
        .select('key, value')
        .eq('company_id', companyId);
      
      const settings: Record<string, string> = {};
      settingsData?.forEach(s => settings[s.key] = s.value);
      
      const printLayout = (settings['print_layout'] as any) || 'v1';
      const paperSize = (settings['printer_paper_size'] as any) || '58mm';
      const estimatedWaitTime = settings['estimated_wait_time'];
      const showReady = printLayout === 'v2';

      if (printLayout === 'v2') {

        const { data: orderData } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        const html = generateProductionTicketHTML({
          tabNumber: (orderData as any)?.daily_number || parseInt(orderNumber.replace('#', '')) || 0,
          tableNumber: (orderData as any)?.table_number,
          customerName: customerName,
          items: items.map((i) => ({
            productName: i.name,
            quantity: i.quantity,
            notes: i.notes || null,
            groupedOptionals: i.product?.groupedOptionals || i.groupedOptionals
          })),
          createdAt: new Date(),
          paperSize: paperSize,
          referenceLabel: (orderData as any)?.short_code
            ? `PEDIDO ${(orderData as any).short_code}`
            : (orderData as any)?.order_code || `PEDIDO #${orderNumber}`,
          companyId: companyId,
          layout: 'v2',
          showReadyTime: showReady,
          readyOffsetMinutes: showReady ? computeReadyOffsetMinutes(estimatedWaitTime, 30) : undefined,
          orderType: (orderData as any)?.origin === 'mesa' ? 'table' : (orderData as any)?.origin === 'balcao' ? 'counter' : ((orderData as any)?.delivery_address ? 'delivery' : 'pickup'),
          deliveryAddress: (orderData as any)?.delivery_address
        });

        return `<!--HTML_START-->${html}<!--HTML_END-->`;
      }


      // Fallback to simple text for V1 or others if not V2
      let text = `PEDIDO #${orderNumber}\n`;
      text += `CLIENTE: ${customerName}\n`;
      text += `ORIGEM: ${orderOrigin}\n`;
      text += `DATA: ${new Date().toLocaleString('pt-BR')}\n`;
      text += `--------------------------------\n`;
      items.forEach(item => {
        text += `${item.quantity}x ${item.name}\n`;
        if (item.notes) {
          const { additionals, observations } = parseNotes(item.notes);
          additionals.forEach(a => text += `  + ${a.toUpperCase()}\n`);
          observations.forEach(o => text += `  * ${o.toUpperCase()}\n`);
        }
      });
      text += `--------------------------------\n`;

      // Amore Mio legacy compatibility: if somehow V2 is disabled but it's Amore Mio, 
      // we still wrap in html/body so the script 1.6.2 parser can at least extract text.
      return `<html><body><pre>${text}</pre></body></html>`;
    };

    // Jobs for specific stations
    for (const [stationId, groupItems] of Object.entries(stationGroups)) {
      jobs.push({
        company_id: companyId,
        label: `Produção #${orderNumber} - ${customerName}`,
        html_content: await generateSimpleText(groupItems),
        station_id: stationId,
        job_type: 'production',
        printed: false
      });
    }

    // Job for default station (no mapping)
    if (defaultItems.length > 0) {
      jobs.push({
        company_id: companyId,
        label: `Produção #${orderNumber} - ${customerName}`,
        html_content: await generateSimpleText(defaultItems),
        station_id: null,
        job_type: 'production',
        printed: false
      });
    }

    if (jobs.length > 0) {
      const { error } = await supabase
        .from('print_queue')
        .insert(jobs);
      
      if (error) throw error;
      console.log(`[PrintRouting] Successfully enqueued ${jobs.length} production jobs for order ${orderNumber}`);
    } else {
      console.log(`[PrintRouting] No production jobs to enqueue for order ${orderNumber}`);
    }

    return true;
  } catch (error) {
    console.error('Error enqueuing production jobs:', error);
    return false;
  }
}

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

function groupRoutableItemsByStation(
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

async function enqueueProductionByStationParams(params: {
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

  const groups = groupRoutableItemsByStation(items, categoryToStation, defaultStation?.id ?? null);
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

type EnqueueProductionParams = {
  companyId: string;
  items: RoutablePrintItem[];
  ticketBase: ProductionTicketBase;
  labelPrefix: string;
  sourceOrderId?: string;
};

export async function enqueueProductionByStation(
  companyId: string,
  orderId: string,
  items: any[],
  orderNumber: string,
  customerName: string,
  orderOrigin?: string,
): Promise<boolean>;
export async function enqueueProductionByStation(
  params: EnqueueProductionParams,
): Promise<number>;
export async function enqueueProductionByStation(
  companyIdOrParams: string | EnqueueProductionParams,
  orderId?: string,
  items?: any[],
  orderNumber?: string,
  customerName?: string,
  orderOrigin?: string,
): Promise<boolean | number> {
  if (typeof companyIdOrParams === 'object') {
    return enqueueProductionByStationParams(companyIdOrParams);
  }
  return enqueueProductionByStationLegacy(
    companyIdOrParams,
    orderId!,
    items!,
    orderNumber!,
    customerName!,
    orderOrigin,
  );
}
