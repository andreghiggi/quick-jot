import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CompanyPlan {
  id: string;
  company_id: string;
  plan_name: string;
  starts_at: string;
  expires_at: string | null;
  active: boolean;
  activated_by: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useCompanyPlans() {
  const [loading, setLoading] = useState(false);

  async function fetchPlanByCompanyId(companyId: string): Promise<CompanyPlan | null> {
    try {
      const { data, error } = await supabase
        .from('company_plans')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching company plan:', error);
      return null;
    }
  }

  async function activateTrial(companyId: string, userId: string): Promise<boolean> {
    setLoading(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error } = await supabase
        .from('company_plans')
        .update({
          active: true,
          activated_by: userId,
          activated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId);

      if (error) throw error;

      toast.success('Trial de 30 dias ativado com sucesso!');
      return true;
    } catch (error) {
      console.error('Error activating trial:', error);
      toast.error('Erro ao ativar trial');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function deactivatePlan(companyId: string): Promise<boolean> {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('company_plans')
        .update({
          active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId);

      if (error) throw error;

      toast.success('Plano desativado');
      return true;
    } catch (error) {
      console.error('Error deactivating plan:', error);
      toast.error('Erro ao desativar plano');
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    fetchPlanByCompanyId,
    activateTrial,
    deactivatePlan,
  };
}
