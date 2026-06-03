import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Coupon } from './useCoupons';
import { isCouponCurrentlyValid } from './useCoupons';

/**
 * Hook PÚBLICO (sem login) — usado no cardápio do cliente.
 * Retorna apenas cupons ATIVOS e dentro da validade da loja.
 */
export function usePublicCoupons(companyId: string | null | undefined) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!companyId) {
        setCoupons([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true);
      if (cancelled) return;
      if (error) {
        console.error('Erro ao carregar cupons públicos:', error);
        setCoupons([]);
      } else {
        // Cupons secretos NÃO aparecem no banner público — só funcionam quando o cliente digita o código.
        const filtered = ((data || []) as Coupon[]).filter(
          (c) => isCouponCurrentlyValid(c) && !c.is_secret,
        );
        setCoupons(filtered);
      }
      setLoading(false);
    }
    run();
    return () => { cancelled = true; };
  }, [companyId]);

  return { coupons, loading };
}