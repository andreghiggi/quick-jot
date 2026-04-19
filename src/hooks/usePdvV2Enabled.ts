import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook isolado que verifica se a empresa tem o módulo PDV V2 ativo.
 * Não interfere em nenhum hook existente.
 */
export function usePdvV2Enabled(companyId?: string | null) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setEnabled(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('company_modules')
      .select('enabled')
      .eq('company_id', companyId)
      .eq('module_name', 'pdv_v2')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setEnabled(!!data?.enabled);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { enabled: !!enabled, loading };
}
