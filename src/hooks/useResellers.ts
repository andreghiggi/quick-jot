import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Reseller {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ResellerSettings {
  id: string;
  reseller_id: string;
  activation_fee: number;
  monthly_fee: number;
  invoice_due_day: number;
  asaas_api_key: string | null;
}

export interface ResellerWithStats extends Reseller {
  settings?: ResellerSettings;
  total_companies: number;
  mrr: number;
}

export function useResellers() {
  const [resellers, setResellers] = useState<ResellerWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResellers = useCallback(async () => {
    try {
      const { data: resellersData, error } = await supabase
        .from('resellers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch settings for all resellers
      const { data: settingsData } = await supabase
        .from('reseller_settings')
        .select('*');

      // Fetch company counts per reseller
      const { data: companiesData } = await supabase
        .from('reseller_companies')
        .select('reseller_id, company_id');

      const settingsMap: Record<string, ResellerSettings> = {};
      (settingsData || []).forEach((s: any) => {
        settingsMap[s.reseller_id] = s;
      });

      const companyCounts: Record<string, number> = {};
      (companiesData || []).forEach((c: any) => {
        companyCounts[c.reseller_id] = (companyCounts[c.reseller_id] || 0) + 1;
      });

      const enriched: ResellerWithStats[] = (resellersData || []).map((r: any) => {
        const settings = settingsMap[r.id];
        const totalCompanies = companyCounts[r.id] || 0;
        const mrr = totalCompanies * (settings?.monthly_fee || 29.90);
        return { ...r, settings, total_companies: totalCompanies, mrr };
      });

      setResellers(enriched);
    } catch (error) {
      console.error('Error fetching resellers:', error);
      toast.error('Erro ao carregar revendedores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResellers();
  }, [fetchResellers]);

  async function createReseller(data: {
    name: string;
    email: string;
    phone?: string;
    activation_fee: number;
    monthly_fee: number;
    invoice_due_day: number;
  }, createdBy: string): Promise<boolean> {
    try {
      const { data: newReseller, error } = await supabase
        .from('resellers')
        .insert({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          created_by: createdBy,
        })
        .select()
        .single();

      if (error) throw error;

      // Create settings
      const { error: settingsError } = await supabase
        .from('reseller_settings')
        .insert({
          reseller_id: newReseller.id,
          activation_fee: data.activation_fee,
          monthly_fee: data.monthly_fee,
          invoice_due_day: data.invoice_due_day,
        });

      if (settingsError) throw settingsError;

      toast.success('Revendedor criado com sucesso!');
      fetchResellers();
      return true;
    } catch (error: any) {
      console.error('Error creating reseller:', error);
      toast.error('Erro ao criar revendedor');
      return false;
    }
  }

  async function updateReseller(id: string, data: {
    name?: string;
    email?: string;
    phone?: string | null;
    activation_fee?: number;
    monthly_fee?: number;
    invoice_due_day?: number;
  }): Promise<boolean> {
    try {
      const { name, email, phone, activation_fee, monthly_fee, invoice_due_day } = data;

      if (name !== undefined || email !== undefined || phone !== undefined) {
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;

        const { error } = await supabase
          .from('resellers')
          .update(updateData)
          .eq('id', id);
        if (error) throw error;
      }

      if (activation_fee !== undefined || monthly_fee !== undefined || invoice_due_day !== undefined) {
        const settingsUpdate: any = {};
        if (activation_fee !== undefined) settingsUpdate.activation_fee = activation_fee;
        if (monthly_fee !== undefined) settingsUpdate.monthly_fee = monthly_fee;
        if (invoice_due_day !== undefined) settingsUpdate.invoice_due_day = invoice_due_day;

        const { error } = await supabase
          .from('reseller_settings')
          .update(settingsUpdate)
          .eq('reseller_id', id);
        if (error) throw error;
      }

      toast.success('Revendedor atualizado!');
      fetchResellers();
      return true;
    } catch (error) {
      console.error('Error updating reseller:', error);
      toast.error('Erro ao atualizar revendedor');
      return false;
    }
  }

  async function toggleResellerStatus(id: string, currentStatus: string): Promise<boolean> {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const { error } = await supabase
        .from('resellers')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      toast.success(newStatus === 'active' ? 'Revendedor ativado!' : 'Revendedor pausado!');
      fetchResellers();
      return true;
    } catch (error) {
      console.error('Error toggling reseller:', error);
      toast.error('Erro ao alterar status');
      return false;
    }
  }

  return {
    resellers,
    loading,
    createReseller,
    updateReseller,
    toggleResellerStatus,
    refetch: fetchResellers,
  };
}
