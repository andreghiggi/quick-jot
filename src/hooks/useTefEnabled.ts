import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useTefEnabled(companyId?: string | null) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkTef() {
      if (!companyId) {
        setLoading(false);
        return;
      }

      try {
        // Verifica tanto TEF PinPad (merchant_id) quanto SmartPOS (terminais ativos)
        const [settingsRes, terminalsRes] = await Promise.all([
          supabase
            .from('store_settings')
            .select('key, value')
            .eq('company_id', companyId)
            .eq('key', 'tef_merchant_id'),
          supabase
            .from('pinpdv_terminals')
            .select('id')
            .eq('company_id', companyId)
            .eq('active', true)
            .limit(1)
        ]);

        const hasMerchantId = settingsRes.data?.some(s => s.value && s.value.trim() !== '');
        const hasSmartPos = (terminalsRes.data?.length || 0) > 0;

        setEnabled(!!(hasMerchantId || hasSmartPos));
      } catch (err) {
        console.error('Error checking TEF status:', err);
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    }

    checkTef();
  }, [companyId]);

  return { enabled, loading };
}
