import { supabase } from '@/integrations/supabase/client';

export interface ProductionJob {
  station_id: string | null;
  items: any[];
}

export async function enqueueProductionByStation(
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

    // 2. Group items by station
    const stationGroups: Record<string, any[]> = {};
    const defaultItems: any[] = [];

    items.forEach(item => {
      const categoryName = item.category || (item as any).category_name;
      const categoryInfo = categoryName ? categoryMapByName[categoryName] : null;

      // Skip if production print is disabled for this category
      if (categoryInfo && categoryInfo.production_print === false) {
        console.log(`[PrintRouting] Skipping item ${item.name} - production print disabled for category ${categoryName}`);
        return;
      }

      // Find category_id for the item
      const categoryId = item.product?.category_id || item.category_id || categoryInfo?.id;
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
      const { generateProductionTicketHTML } = await import('@/utils/printProductionTicket');
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
        return generateProductionTicketHTML({
          tabNumber: parseInt(orderNumber.replace('#', '')) || 0,
          customerName: customerName,
          items: items.map((i) => ({
            productName: i.name,
            quantity: i.quantity,
            notes: i.notes || null
          })),
          createdAt: new Date(),
          paperSize: paperSize,
          referenceLabel: `PEDIDO #${orderNumber}`,
          companyId: companyId,
          layout: 'v2',
          showReadyTime: showReady,
          readyOffsetMinutes: showReady ? computeReadyOffsetMinutes(estimatedWaitTime, 30) : undefined,
        });
      }

      // Fallback to simple text for V1 or others if not V2
      let text = `PEDIDO #${orderNumber}\n`;
      text += `CLIENTE: ${customerName}\n`;
      text += `ORIGEM: ${orderOrigin}\n`;
      text += `DATA: ${new Date().toLocaleString('pt-BR')}\n`;
      text += `--------------------------------\n`;
      items.forEach(item => {
        text += `${item.quantity}x ${item.name}\n`;
        if (item.notes) text += `  Obs: ${item.notes}\n`;
      });
      text += `--------------------------------\n`;
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
