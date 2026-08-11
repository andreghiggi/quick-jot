import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useFiscalEnabled(companyId?: string | null) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkFiscal() {
      if (!companyId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('store_settings')
          .select('key, value')
          .eq('company_id', companyId)
          .in('key', ['fiscal_token', 'focus_nfe_token', 'focus_nfe_environment']);

        if (error) throw error;

        // Se tiver qualquer token fiscal configurado
        const hasToken = data?.some(s => 
          (s.key === 'fiscal_token' || s.key === 'focus_nfe_token') && 
          s.value && 
          s.value.trim() !== ''
        );

        setEnabled(!!hasToken);
      } catch (err) {
        console.error('Error checking fiscal status:', err);
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    }

    checkFiscal();
  }, [companyId]);

  return { enabled, loading };
}
