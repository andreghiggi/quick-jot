import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Reseller {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  cnpj: string | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_cep: string | null;
  responsible_name: string | null;
  responsible_email: string | null;
  responsible_phone: string | null;
  status: string;
  created_by: string;
  user_id: string | null;
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

export interface ResellerFormData {
  // Company info
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  address_street: string;
  address_number: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_cep: string;
  // Responsible person
  responsible_name: string;
  responsible_email: string;
  responsible_phone: string;
  // Commercial settings
  activation_fee: number;
  monthly_fee: number;
  invoice_due_day: number;
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

      const { data: settingsData } = await supabase
        .from('reseller_settings')
        .select('*');

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

  async function createReseller(data: ResellerFormData, createdBy: string): Promise<string | null> {
    try {
      const { data: newReseller, error } = await supabase
        .from('resellers')
        .insert({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          cnpj: data.cnpj || null,
          address_street: data.address_street || null,
          address_number: data.address_number || null,
          address_neighborhood: data.address_neighborhood || null,
          address_city: data.address_city || null,
          address_state: data.address_state || null,
          address_cep: data.address_cep || null,
          responsible_name: data.responsible_name || null,
          responsible_email: data.responsible_email || null,
          responsible_phone: data.responsible_phone || null,
          created_by: createdBy,
        })
        .select()
        .single();

      if (error) throw error;

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
      return newReseller.id;
    } catch (error: any) {
      console.error('Error creating reseller:', error);
      toast.error('Erro ao criar revendedor');
      return null;
    }
  }

  async function updateReseller(id: string, data: Partial<ResellerFormData>): Promise<boolean> {
    try {
      const resellerFields: Record<string, any> = {};
      const settingsFields: Record<string, any> = {};

      // Reseller table fields
      const resellerKeys = [
        'name', 'email', 'phone', 'cnpj',
        'address_street', 'address_number', 'address_neighborhood',
        'address_city', 'address_state', 'address_cep',
        'responsible_name', 'responsible_email', 'responsible_phone',
      ] as const;
      for (const key of resellerKeys) {
        if (data[key] !== undefined) resellerFields[key] = data[key] || null;
      }

      // Settings fields
      if (data.activation_fee !== undefined) settingsFields.activation_fee = data.activation_fee;
      if (data.monthly_fee !== undefined) settingsFields.monthly_fee = data.monthly_fee;
      if (data.invoice_due_day !== undefined) settingsFields.invoice_due_day = data.invoice_due_day;

      if (Object.keys(resellerFields).length > 0) {
        const { error } = await supabase.from('resellers').update(resellerFields).eq('id', id);
        if (error) throw error;
      }

      if (Object.keys(settingsFields).length > 0) {
        const { error } = await supabase.from('reseller_settings').update(settingsFields).eq('reseller_id', id);
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
      const { error } = await supabase.from('resellers').update({ status: newStatus }).eq('id', id);
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
