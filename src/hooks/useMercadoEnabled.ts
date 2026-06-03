import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook isolado que verifica se a empresa tem o módulo `mercado` ativo.
 * Cacheia em localStorage para evitar flash de UI.
 *
 * IMPORTANTE: este hook só LIGA features novas (busca por GTIN, etiquetas,
 * Frente de Caixa). Nunca deve alterar comportamento existente quando
 * desativado.
 */
const cacheKey = (companyId: string) => `mercado_enabled_${companyId}`;

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

export function useMercadoEnabled(companyId?: string | null) {
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
      .eq('module_name', 'mercado')
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
