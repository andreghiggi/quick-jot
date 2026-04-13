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
  plan?: {
    id: string;
    plan_name: string;
    active: boolean;
    starts_at: string;
    expires_at: string | null;
  } | null;
}

export function useResellerPortal() {
  const { user, hasRole } = useAuthContext();
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
      // Fetch reseller record
      const { data: resellerData, error: rErr } = await supabase
        .from('resellers')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (rErr) throw rErr;
      setReseller(resellerData);

      // Fetch settings
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

      // Fetch companies via reseller_companies
      const { data: rcData } = await supabase
        .from('reseller_companies')
        .select('company_id')
        .eq('reseller_id', resellerData.id);

      const companyIds = (rcData || []).map((rc: any) => rc.company_id);

      if (companyIds.length > 0) {
        const { data: companiesData } = await supabase
          .from('companies')
          .select('*')
          .in('id', companyIds)
          .order('created_at', { ascending: false });

        // Fetch plans
        const { data: plansData } = await supabase
          .from('company_plans')
          .select('*')
          .in('company_id', companyIds);

        const plansMap: Record<string, any> = {};
        (plansData || []).forEach((p: any) => {
          plansMap[p.company_id] = p;
        });

        setCompanies((companiesData || []).map((c: any) => ({
          ...c,
          plan: plansMap[c.id] || null,
        })));
      } else {
        setCompanies([]);
      }
    } catch (error) {
      console.error('Error fetching reseller data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, isReseller]);

  useEffect(() => {
    fetchResellerData();
  }, [fetchResellerData]);

  async function createCompany(data: {
    name: string;
    slug: string;
    phone?: string;
  }): Promise<boolean> {
    if (!reseller) return false;

    try {
      const { data: newCompany, error } = await supabase
        .from('companies')
        .insert({
          name: data.name,
          slug: data.slug,
          phone: data.phone || null,
          reseller_id: reseller.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Link to reseller
      const { error: linkError } = await supabase
        .from('reseller_companies')
        .insert({
          reseller_id: reseller.id,
          company_id: newCompany.id,
        });

      if (linkError) throw linkError;

      // Create inactive trial plan
      await supabase
        .from('company_plans')
        .insert({
          company_id: newCompany.id,
          plan_name: 'trial',
          active: false,
        });

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

  async function activateTrial(companyId: string): Promise<boolean> {
    if (!user || !reseller) return false;
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      const { error } = await supabase
        .from('company_plans')
        .update({
          active: true,
          activated_by: user.id,
          activated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq('company_id', companyId);

      if (error) throw error;

      // Create prorated billing item for this activation
      const company = companies.find(c => c.id === companyId);
      if (company) {
        try {
          await supabase.functions.invoke('reseller-billing', {
            body: {
              action: 'create_prorated_item',
              reseller_id: reseller.id,
              company_id: companyId,
              company_name: company.name,
              activation_fee: settings?.activation_fee ?? 180,
            },
          });
        } catch (billingErr) {
          console.error('Billing prorated item error (non-blocking):', billingErr);
        }
      }

      toast.success('Trial de 14 dias ativado!');
      fetchResellerData();
      return true;
    } catch (error) {
      console.error('Error activating trial:', error);
      toast.error('Erro ao ativar trial');
      return false;
    }
  }

  async function toggleCompanyPlan(companyId: string, currentActive: boolean): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('company_plans')
        .update({ active: !currentActive })
        .eq('company_id', companyId);

      if (error) throw error;
      toast.success(currentActive ? 'Plano pausado' : 'Plano ativado');
      fetchResellerData();
      return true;
    } catch (error) {
      console.error('Error toggling plan:', error);
      toast.error('Erro ao alterar plano');
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

  // Computed stats
  const activeCompanies = companies.filter(c => c.plan?.active);
  const trialCompanies = companies.filter(c => c.plan?.active && c.plan?.expires_at);
  const expiredCompanies = companies.filter(c => {
    if (!c.plan?.expires_at || !c.plan?.active) return false;
    return new Date(c.plan.expires_at) < new Date();
  });

  const mrr = activeCompanies.length * (settings?.monthly_fee || 29.90);

  return {
    reseller,
    settings,
    companies,
    loading,
    isReseller,
    stats: {
      totalActive: activeCompanies.length,
      totalTrial: trialCompanies.length,
      totalExpired: expiredCompanies.length,
      mrr,
    },
    createCompany,
    activateTrial,
    toggleCompanyPlan,
    updateProfile,
    updateSettings,
    refetch: fetchResellerData,
  };
}
