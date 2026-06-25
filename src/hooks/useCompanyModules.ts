import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { clearPdvV2Cache } from '@/hooks/usePdvV2Enabled';
import { clearCardapioCache } from '@/hooks/useCardapioEnabled';

export interface CompanyModule {
  id: string;
  company_id: string;
  module_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface UseCompanyModulesOptions {
  companyId?: string;
}

const COMPANY_MODULES_CHANGED_EVENT = 'company-modules-changed';

function notifyCompanyModulesChanged(companyId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(COMPANY_MODULES_CHANGED_EVENT, { detail: { companyId } })
  );
}

export function useCompanyModules(options: UseCompanyModulesOptions = {}) {
  const { companyId } = options;
  const [modules, setModules] = useState<CompanyModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchModules();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId || typeof window === 'undefined') return;

    const handleModulesChanged = (event: Event) => {
      const changedCompanyId = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      if (changedCompanyId === companyId) {
        fetchModules();
      }
    };

    window.addEventListener(COMPANY_MODULES_CHANGED_EVENT, handleModulesChanged);
    return () => window.removeEventListener(COMPANY_MODULES_CHANGED_EVENT, handleModulesChanged);
  }, [companyId]);

  async function fetchModules() {
    if (!companyId) return;
    
    try {
      const { data, error } = await supabase
        .from('company_modules')
        .select('*')
        .eq('company_id', companyId);

      if (error) throw error;
      setModules(data || []);
    } catch (error) {
      console.error('Error fetching modules:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleModule(moduleName: string, enabled: boolean): Promise<boolean> {
    if (!companyId) return false;

    try {
      // Check if module exists
      const existing = modules.find(m => m.module_name === moduleName);

      if (existing) {
        const { error } = await supabase
          .from('company_modules')
          .update({ enabled })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_modules')
          .insert({
            company_id: companyId,
            module_name: moduleName,
            enabled
          });

        if (error) throw error;
      }

      await fetchModules();
      notifyCompanyModulesChanged(companyId);
      // Invalida o cache do redirect/guard de PDV V2 sempre que algum dos
      // dois PDVs muda (o trigger no banco também desativa o "outro").
      if (moduleName === 'pdv_v1' || moduleName === 'pdv_v2') {
        clearPdvV2Cache(companyId);
      }
      if (moduleName === 'cardapio' || moduleName === 'mercado') {
        clearCardapioCache(companyId);
      }
      toast.success(`Módulo ${enabled ? 'habilitado' : 'desabilitado'} com sucesso!`);
      return true;
    } catch (error) {
      console.error('Error toggling module:', error);
      toast.error('Erro ao alterar módulo');
      return false;
    }
  }

  function isModuleEnabled(moduleName: string): boolean {
    const module = modules.find(m => m.module_name === moduleName);
    return module?.enabled || false;
  }

  return {
    modules,
    loading,
    toggleModule,
    isModuleEnabled,
    refetch: fetchModules
  };
}
