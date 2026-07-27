import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Módulo PinPDV v1 (piloto — SmartPOS PinPDV).
 * Recurso NOVO. Não afeta em nada o fluxo TEF/PinPad já existente
 * (Multiplus PinPad serial, PDV V2, Pedido Express etc.) — ele apenas
 * habilita a nova UI de cadastro de terminais e o novo fluxo de cobrança
 * PinPDV SmartPOS quando ativo.
 */
const cacheKey = (companyId: string) => `pinpdv_v1_enabled_${companyId}`;

function readCache(companyId?: string | null): boolean | null {
  if (!companyId || typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(cacheKey(companyId));
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch {
    return null;
  }
}

function writeCache(companyId: string, value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(cacheKey(companyId), value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function usePinpdvV1Enabled(companyId?: string | null) {
  const [enabled, setEnabled] = useState<boolean | null>(() => readCache(companyId));
  const [loading, setLoading] = useState(enabled === null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setEnabled(false);
      setLoading(false);
      return;
    }

    const cached = readCache(companyId);
    if (cached !== null) {
      setEnabled(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    supabase
      .from('company_modules')
      .select('enabled')
      .eq('company_id', companyId)
      .eq('module_name', 'pinpdv_v1')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const value = !!data?.enabled;
        setEnabled(value);
        setLoading(false);
        writeCache(companyId, value);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { enabled: !!enabled, loading };
}