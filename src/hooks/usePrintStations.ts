import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PrintStation {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  handlesReceipt: boolean;
  active: boolean;
  displayOrder: number;
}

function mapStation(row: Record<string, unknown>): PrintStation {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    slug: row.slug as string,
    isDefault: Boolean(row.is_default),
    handlesReceipt: Boolean(row.handles_receipt),
    active: Boolean(row.active),
    displayOrder: Number(row.display_order ?? 0),
  };
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function usePrintStations(companyId?: string | null) {
  const [stations, setStations] = useState<PrintStation[]>([]);
  const [categoryStationMap, setCategoryStationMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!companyId) {
      setStations([]);
      setCategoryStationMap({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: stationRows, error: sErr } = await supabase
        .from('print_stations' as never)
        .select('*')
        .eq('company_id', companyId)
        .order('display_order', { ascending: true });
      if (sErr) throw sErr;

      const { data: mapRows, error: mErr } = await supabase
        .from('category_print_stations' as never)
        .select('category_id, station_id')
        .eq('company_id', companyId);
      if (mErr) throw mErr;

      setStations((stationRows ?? []).map((r) => mapStation(r as Record<string, unknown>)));
      const map: Record<string, string> = {};
      for (const row of mapRows ?? []) {
        const r = row as { category_id: string; station_id: string };
        map[r.category_id] = r.station_id;
      }
      setCategoryStationMap(map);
    } catch (e) {
      console.error('usePrintStations:', e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function addStation(name: string) {
    if (!companyId || !name.trim()) return false;
    const slug = slugify(name) || `estacao-${Date.now()}`;
    const maxOrder = stations.reduce((m, s) => Math.max(m, s.displayOrder), 0);
    const { error } = await supabase.from('print_stations' as never).insert({
      company_id: companyId,
      name: name.trim(),
      slug,
      display_order: maxOrder + 1,
      is_default: stations.length === 0,
    } as never);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await fetchAll();
    return true;
  }

  async function updateStation(
    id: string,
    patch: Partial<Pick<PrintStation, 'name' | 'isDefault' | 'handlesReceipt' | 'active'>>,
  ) {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.isDefault !== undefined) payload.is_default = patch.isDefault;
    if (patch.handlesReceipt !== undefined) payload.handles_receipt = patch.handlesReceipt;
    if (patch.active !== undefined) payload.active = patch.active;

    if (patch.isDefault && companyId) {
      await supabase
        .from('print_stations' as never)
        .update({ is_default: false } as never)
        .eq('company_id', companyId);
    }

    const { error } = await supabase.from('print_stations' as never).update(payload as never).eq('id', id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await fetchAll();
    return true;
  }

  async function deleteStation(id: string) {
    const { error } = await supabase.from('print_stations' as never).delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await fetchAll();
    return true;
  }

  async function setCategoryStation(categoryId: string, stationId: string | null) {
    if (!companyId) return false;
    await supabase.from('category_print_stations' as never).delete().eq('category_id', categoryId);
    if (!stationId) {
      setCategoryStationMap((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      return true;
    }
    const { error } = await supabase.from('category_print_stations' as never).insert({
      category_id: categoryId,
      station_id: stationId,
      company_id: companyId,
    } as never);
    if (error) {
      toast.error(error.message);
      return false;
    }
    setCategoryStationMap((prev) => ({ ...prev, [categoryId]: stationId }));
    return true;
  }

  return {
    stations,
    categoryStationMap,
    loading,
    refetch: fetchAll,
    addStation,
    updateStation,
    deleteStation,
    setCategoryStation,
  };
}
