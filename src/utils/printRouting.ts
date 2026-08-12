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
    // 1. Fetch category mappings
    const { data: mappings } = await supabase
      .from('category_print_stations' as any)
      .select('category_id, station_id')
      .eq('company_id', companyId);

    const mappingDict: Record<string, string> = {};
    mappings?.forEach((m: any) => {
      mappingDict[m.category_id] = m.station_id;
    });

    // 2. Group items by station
    const stationGroups: Record<string, any[]> = {};
    const defaultItems: any[] = [];

    items.forEach(item => {
      // Find category_id for the item
      // We assume items have product.category_id or similar
      const categoryId = item.product?.category_id || item.category_id || item.category;
      // If we only have category name, we need to find its ID in mappingDict
      let stationId = categoryId ? mappingDict[categoryId] : null;

      if (!stationId && typeof categoryId === 'string' && !categoryId.includes('-')) {
        // categoryId might be a name, search mappingDict for a key that matches category names
        // Note: category_id in category_print_stations is a UUID. 
        // We'd need the categories list to map name -> ID.
        // For now, let's look for any station_id if the mapping is empty or if we can't find it.
      }

      if (stationId) {
        if (!stationGroups[stationId]) stationGroups[stationId] = [];
        stationGroups[stationId].push(item);
      } else {
        defaultItems.push(item);
      }
    });

    // 3. Create jobs
    const jobs: any[] = [];

    // Jobs for specific stations
    for (const [stationId, groupItems] of Object.entries(stationGroups)) {
      jobs.push({
        company_id: companyId,
        order_id: orderId,
        order_number: orderNumber,
        customer_name: customerName,
        items_json: groupItems,
        origin: orderOrigin,
        status: 'pending',
        station_id: stationId,
        job_type: 'production'
      });
    }

    // Job for default station (no mapping)
    if (defaultItems.length > 0) {
      jobs.push({
        company_id: companyId,
        order_id: orderId,
        order_number: orderNumber,
        customer_name: customerName,
        items_json: defaultItems,
        origin: orderOrigin,
        status: 'pending',
        station_id: null,
        job_type: 'production'
      });
    }

    if (jobs.length > 0) {
      const { error } = await supabase
        .from('print_queue')
        .insert(jobs);
      
      if (error) throw error;
    }

    return true;
  } catch (error) {
    console.error('Error enqueuing production jobs:', error);
    return false;
  }
}
