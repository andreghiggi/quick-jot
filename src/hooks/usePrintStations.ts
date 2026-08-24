import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PrintStation {
  id: string;
  name: string;
  company_id: string;
  printer_name?: string | null;
}

export interface CategoryPrintStation {
  id: string;
  category_id: string;
  station_id: string;
}

export function usePrintStations(companyId?: string) {
  const [stations, setStations] = useState<PrintStation[]>([]);
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchStations = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('print_stations' as any)
        .select('*')
        .eq('company_id', companyId);

      if (error) throw error;
      setStations((data as any) || []);
    } catch (error) {
      console.error('Error fetching stations:', error);
    }
  }, [companyId]);

  const fetchMappings = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('category_print_stations' as any)
        .select('*')
        .eq('company_id', companyId);

      if (error) throw error;
      const mapping: Record<string, string> = {};
      data?.forEach((m: any) => {
        mapping[m.category_id] = m.station_id;
      });
      setCategoryMappings(mapping);
    } catch (error) {
      console.error('Error fetching mappings:', error);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      Promise.all([fetchStations(), fetchMappings()]).finally(() => setLoading(false));
    }
  }, [companyId, fetchStations, fetchMappings]);

  const addStation = async (name: string) => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('print_stations' as any)
        .insert([{ name, company_id: companyId }])
        .select()
        .single();

      if (error) throw error;
      setStations(prev => [...prev, data as any]);
      toast.success('Estação adicionada');
      return data;
    } catch (error) {
      console.error('Error adding station:', error);
      toast.error('Erro ao adicionar estação');
    }
  };

  const deleteStation = async (id: string) => {
    try {
      const { error } = await supabase
        .from('print_stations' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setStations(prev => prev.filter(s => s.id !== id));
      toast.success('Estação removida');
    } catch (error) {
      console.error('Error deleting station:', error);
      toast.error('Erro ao remover estação');
    }
  };

  const mapCategoryToStation = async (categoryId: string, stationId: string | null) => {
    if (!companyId) return;
    try {
      if (!stationId) {
        const { error } = await supabase
          .from('category_print_stations' as any)
          .delete()
          .eq('category_id', categoryId);
        if (error) throw error;
        setCategoryMappings(prev => {
          const next = { ...prev };
          delete next[categoryId];
          return next;
        });
      } else {
        const { error } = await supabase
          .from('category_print_stations' as any)
          .upsert({
            company_id: companyId,
            category_id: categoryId,
            station_id: stationId
          }, { onConflict: 'category_id' });
        
        if (error) throw error;
        setCategoryMappings(prev => ({ ...prev, [categoryId]: stationId }));
      }
      toast.success('Vínculo atualizado');
    } catch (error) {
      console.error('Error mapping category:', error);
      toast.error('Erro ao atualizar vínculo');
    }
  };

  return {
    stations,
    categoryMappings,
    loading,
    addStation,
    deleteStation,
    mapCategoryToStation,
    refresh: () => Promise.all([fetchStations(), fetchMappings()])
  };
}
