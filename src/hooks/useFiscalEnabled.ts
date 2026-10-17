import { useState, useEffect } from 'react';
import { fetchStoreSettingsRows } from '@/hooks/useStoreSettings';

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
        // Cache compartilhado de store_settings (evita rajadas repetidas).
        const data = await fetchStoreSettingsRows(companyId);

        // Se tiver qualquer token fiscal configurado
        const hasToken = data?.some(s =>
          (s.key === 'fiscal_flow_api_token' || s.key === 'fiscal_token' || s.key === 'focus_nfe_token') &&
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
