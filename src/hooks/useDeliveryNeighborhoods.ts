import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DeliveryNeighborhood {
  id: string;
  companyId: string;
  neighborhoodName: string;
  deliveryFee: number;
  active: boolean;
}

interface UseDeliveryNeighborhoodsOptions {
  companyId?: string | null;
}

export function useDeliveryNeighborhoods(options: UseDeliveryNeighborhoodsOptions = {}) {
  const { companyId } = options;
  const [neighborhoods, setNeighborhoods] = useState<DeliveryNeighborhood[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchNeighborhoods() {
    if (!companyId) {
      setNeighborhoods([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('delivery_neighborhoods')
        .select('*')
        .eq('company_id', companyId)
        .order('neighborhood_name', { ascending: true });

      if (error) throw error;

      const mapped: DeliveryNeighborhood[] = (data || []).map((n) => ({
        id: n.id,
        companyId: n.company_id,
        neighborhoodName: n.neighborhood_name,
        deliveryFee: Number(n.delivery_fee),
        active: n.active,
      }));

      setNeighborhoods(mapped);
    } catch (error) {
      console.error('Error fetching neighborhoods:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNeighborhoods();
  }, [companyId]);

  async function addNeighborhood(neighborhoodName: string, deliveryFee: number): Promise<boolean> {
    if (!companyId) return false;

    try {
      const { error } = await supabase
        .from('delivery_neighborhoods')
        .insert({
          company_id: companyId,
          neighborhood_name: neighborhoodName,
          delivery_fee: deliveryFee,
          active: true,
        });

      if (error) throw error;

      await fetchNeighborhoods();
      toast.success('Bairro adicionado!');
      return true;
    } catch (error: any) {
      console.error('Error adding neighborhood:', error);
      if (error.code === '23505') {
        toast.error('Este bairro já existe');
      } else {
        toast.error('Erro ao adicionar bairro');
      }
      return false;
    }
  }

  async function updateNeighborhood(id: string, data: Partial<DeliveryNeighborhood>): Promise<boolean> {
    try {
      const updateData: any = {};
      if (data.neighborhoodName !== undefined) updateData.neighborhood_name = data.neighborhoodName;
      if (data.deliveryFee !== undefined) updateData.delivery_fee = data.deliveryFee;
      if (data.active !== undefined) updateData.active = data.active;

      const { error } = await supabase
        .from('delivery_neighborhoods')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      await fetchNeighborhoods();
      toast.success('Bairro atualizado!');
      return true;
    } catch (error) {
      console.error('Error updating neighborhood:', error);
      toast.error('Erro ao atualizar bairro');
      return false;
    }
  }

  async function deleteNeighborhood(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('delivery_neighborhoods')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchNeighborhoods();
      toast.success('Bairro removido!');
      return true;
    } catch (error) {
      console.error('Error deleting neighborhood:', error);
      toast.error('Erro ao remover bairro');
      return false;
    }
  }

  function getActiveNeighborhoods(): DeliveryNeighborhood[] {
    return neighborhoods.filter((n) => n.active);
  }

  return {
    neighborhoods,
    loading,
    addNeighborhood,
    updateNeighborhood,
    deleteNeighborhood,
    getActiveNeighborhoods,
    refetch: fetchNeighborhoods,
  };
}
