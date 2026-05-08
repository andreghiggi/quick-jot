import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook isolado que verifica se a empresa tem o módulo PDV V2 ativo.
 * Cacheia o último valor conhecido em localStorage para evitar flash de UI
 * (ex.: sidebar mostrando "Dashboard" antes de virar "PDV").
 */
const cacheKey = (companyId: string) => `pdv_v2_enabled_${companyId}`;

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

export function usePdvV2Enabled(companyId?: string | null) {
  const [enabled, setEnabled] = useState<boolean | null>(() => readCache(companyId));
  const [loading, setLoading] = useState(enabled === null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setEnabled(false);
      setLoading(false);
      return;
    }

    // Hidrata imediatamente do cache para evitar flash
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
      .eq('module_name', 'pdv_v2')
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

/**
 * Limpa o cache local de pdv_v2_enabled. Use no signOut e quando o admin
 * alternar o módulo, para que o redirect /pdv-v2 reflita o estado real
 * sem depender de reload completo.
 */
export function clearPdvV2Cache(companyId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (companyId) {
      window.localStorage.removeItem(`pdv_v2_enabled_${companyId}`);
    } else {
      // varre todas as chaves do prefixo
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('pdv_v2_enabled_')) {
          window.localStorage.removeItem(k);
        }
      }
    }
  } catch {
    /* ignore */
  }
}
