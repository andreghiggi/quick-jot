import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ResellerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  user_id: string | null;
}

export interface ResellerPortalSettings {
  activation_fee: number;
  monthly_fee: number;
  invoice_due_day: number;
  asaas_api_key: string | null;
}

export interface ResellerCompany {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  active: boolean;
  created_at: string;
  login_email?: string | null;
  initial_password?: string | null;
}

export function useResellerPortal() {
  const { user, hasRole, impersonatedReseller } = useAuthContext();
  const [reseller, setReseller] = useState<ResellerProfile | null>(null);
  const [settings, setSettings] = useState<ResellerPortalSettings | null>(null);
  const [companies, setCompanies] = useState<ResellerCompany[]>([]);
  const [loading, setLoading] = useState(true);

  const isReseller = hasRole('reseller');

  const fetchResellerData = useCallback(async () => {
    if (!user || !isReseller) {
      setLoading(false);
      return;
    }

    try {
      const resellerQuery = supabase.from('resellers').select('*');
      const { data: resellerData, error: rErr } = impersonatedReseller
        ? await resellerQuery.eq('id', impersonatedReseller.id).single()
        : await resellerQuery.eq('user_id', user.id).single();

      if (rErr) throw rErr;
      setReseller(resellerData);

      const { data: settingsData } = await supabase
        .from('reseller_settings')
        .select('*')
        .eq('reseller_id', resellerData.id)
        .single();

      if (settingsData) {
        setSettings({
          activation_fee: settingsData.activation_fee,
          monthly_fee: settingsData.monthly_fee,
          invoice_due_day: settingsData.invoice_due_day,
          asaas_api_key: settingsData.asaas_api_key,
        });
      }

      const { data: companiesData } = await supabase
        .from('companies')
        .select('*')
        .eq('reseller_id', resellerData.id)
        .order('created_at', { ascending: false });

      setCompanies((companiesData || []) as ResellerCompany[]);
    } catch (error) {
      console.error('Error fetching reseller data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, isReseller, impersonatedReseller]);

  useEffect(() => {
    fetchResellerData();
  }, [fetchResellerData]);

  async function createCompany(data: {
    name: string;
    slug: string;
    phone?: string;
    login_email?: string;
    initial_password?: string;
    cnpj?: string;
    razao_social?: string;
    address_cep?: string;
    address_street?: string;
    address_number?: string;
    address_neighborhood?: string;
    address_city?: string;
    address_state?: string;
    responsible_name?: string;
    responsible_cpf?: string;
    responsible_rg?: string;
    responsible_email?: string;
    responsible_phone?: string;
    activation_payment_option?: 'now' | '30_days' | '3x_no_entry' | '3x_entry';
  }): Promise<boolean> {
    if (!reseller) return false;

    try {
      const { data: newCompany, error } = await supabase
        .from('companies')
        .insert({
          name: data.name,
          slug: data.slug,
          phone: data.phone || null,
          login_email: data.login_email || null,
          initial_password: data.initial_password || null,
          cnpj: data.cnpj || null,
          razao_social: data.razao_social || null,
          address_cep: data.address_cep || null,
          address_street: data.address_street || null,
          address_number: data.address_number || null,
          address_neighborhood: data.address_neighborhood || null,
          address_city: data.address_city || null,
          address_state: data.address_state || null,
          responsible_name: data.responsible_name || null,
          responsible_cpf: data.responsible_cpf || null,
          responsible_rg: data.responsible_rg || null,
          responsible_email: data.responsible_email || null,
          responsible_phone: data.responsible_phone || null,
          reseller_id: reseller.id,
          active: true,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Link via reseller_companies (kept for backward compat)
      await supabase
        .from('reseller_companies')
        .insert({
          reseller_id: reseller.id,
          company_id: newCompany.id,
        });

      // Trigger backfill for this newly created company so the prorated invoice appears immediately
      try {
        await supabase.functions.invoke('reseller-billing', {
          body: {
            action: 'backfill_invoices',
            reseller_id: reseller.id,
            company_id: newCompany.id,
          },
        });
      } catch (billingErr) {
        console.error('Backfill invoice on create (non-blocking):', billingErr);
      }

      // Generate activation invoice(s) according to chosen payment option
      if (data.activation_payment_option) {
        try {
          await supabase.functions.invoke('reseller-billing', {
            body: {
              action: 'activation_invoice',
              reseller_id: reseller.id,
              company_id: newCompany.id,
              payment_option: data.activation_payment_option,
            },
          });
        } catch (actErr) {
          console.error('Activation invoice on create (non-blocking):', actErr);
        }
      }

      toast.success('Loja criada com sucesso!');
      fetchResellerData();
      return true;
    } catch (error: any) {
      console.error('Error creating company:', error);
      if (error.code === '23505') {
        toast.error('Já existe uma loja com esse slug');
      } else {
        toast.error('Erro ao criar loja');
      }
      return false;
    }
  }

  async function updateProfile(data: {
    name?: string;
    email?: string;
    phone?: string | null;
  }): Promise<boolean> {
    if (!reseller) return false;
    try {
      const { error } = await supabase
        .from('resellers')
        .update(data)
        .eq('id', reseller.id);

      if (error) throw error;
      toast.success('Perfil atualizado!');
      fetchResellerData();
      return true;
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Erro ao atualizar perfil');
      return false;
    }
  }

  async function updateSettings(data: {
    invoice_due_day?: number;
    asaas_api_key?: string | null;
  }): Promise<boolean> {
    if (!reseller) return false;
    try {
      const { error } = await supabase
        .from('reseller_settings')
        .update(data)
        .eq('reseller_id', reseller.id);

      if (error) throw error;
      toast.success('Configurações atualizadas!');
      fetchResellerData();
      return true;
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Erro ao atualizar configurações');
      return false;
    }
  }

  // Computed stats — based purely on company.active (no more plan/trial concept)
  const activeCompanies = companies.filter(c => c.active);
  const inactiveCompanies = companies.filter(c => !c.active);
  const mrr = activeCompanies.length * (settings?.monthly_fee || 29.90);

  return {
    reseller,
    settings,
    companies,
    loading,
    isReseller,
    stats: {
      totalActive: activeCompanies.length,
      totalInactive: inactiveCompanies.length,
      mrr,
    },
    createCompany,
    updateProfile,
    updateSettings,
    refetch: fetchResellerData,
  };
}
