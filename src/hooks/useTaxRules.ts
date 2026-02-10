import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TaxRule {
  id: string;
  company_id: string;
  name: string;
  cfop: string;
  ncm: string;
  csosn: string;
  icms_origin: string;
  icms_aliquot: number;
  pis_cst: string;
  pis_aliquot: number;
  cofins_cst: string;
  cofins_aliquot: number;
  ipi_cst: string;
  ipi_aliquot: number;
  cest: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type TaxRuleFormData = Omit<TaxRule, 'id' | 'company_id' | 'created_at' | 'updated_at'>;

interface UseTaxRulesOptions {
  companyId?: string;
}

export function useTaxRules(options: UseTaxRulesOptions = {}) {
  const { companyId } = options;
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchTaxRules();
    } else {
      setTaxRules([]);
      setLoading(false);
    }
  }, [companyId]);

  async function fetchTaxRules() {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('tax_rules')
        .select('*')
        .eq('company_id', companyId)
        .order('name');

      if (error) throw error;
      setTaxRules((data as TaxRule[]) || []);
    } catch (error) {
      console.error('Error fetching tax rules:', error);
      toast.error('Erro ao carregar regras tributárias');
    } finally {
      setLoading(false);
    }
  }

  async function addTaxRule(data: TaxRuleFormData): Promise<boolean> {
    if (!companyId) return false;
    try {
      const { error } = await supabase
        .from('tax_rules')
        .insert({ ...data, company_id: companyId });

      if (error) throw error;
      await fetchTaxRules();
      toast.success('Regra tributária criada!');
      return true;
    } catch (error: any) {
      console.error('Error adding tax rule:', error);
      if (error?.code === '23505') {
        toast.error('Já existe uma regra com esse nome');
      } else {
        toast.error('Erro ao criar regra tributária');
      }
      return false;
    }
  }

  async function updateTaxRule(id: string, data: Partial<TaxRuleFormData>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tax_rules')
        .update(data)
        .eq('id', id);

      if (error) throw error;
      await fetchTaxRules();
      toast.success('Regra tributária atualizada!');
      return true;
    } catch (error: any) {
      console.error('Error updating tax rule:', error);
      if (error?.code === '23505') {
        toast.error('Já existe uma regra com esse nome');
      } else {
        toast.error('Erro ao atualizar regra tributária');
      }
      return false;
    }
  }

  async function deleteTaxRule(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tax_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchTaxRules();
      toast.success('Regra tributária removida!');
      return true;
    } catch (error) {
      console.error('Error deleting tax rule:', error);
      toast.error('Erro ao remover regra tributária');
      return false;
    }
  }

  async function bulkAssignTaxRule(productIds: string[], taxRuleId: string | null): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('products')
        .update({ tax_rule_id: taxRuleId })
        .in('id', productIds);

      if (error) throw error;
      toast.success(`${productIds.length} produto(s) atualizado(s)!`);
      return true;
    } catch (error) {
      console.error('Error bulk assigning tax rule:', error);
      toast.error('Erro ao atribuir regra tributária');
      return false;
    }
  }

  return {
    taxRules,
    loading,
    addTaxRule,
    updateTaxRule,
    deleteTaxRule,
    bulkAssignTaxRule,
    refetch: fetchTaxRules,
  };
}
