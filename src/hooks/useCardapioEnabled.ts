import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook que verifica se o módulo `cardapio` está ATIVO para a loja.
 *
 * Diferente de `useMercadoEnabled`, este hook **assume verdadeiro por padrão**:
 * se não existir nenhuma linha em `company_modules` com `module_name='cardapio'`,
 * a loja é considerada com cardápio LIGADO. Isto garante zero impacto nas
 * lojas existentes (todas têm cardápio).
 *
 * Apenas quando o Super Admin explicitamente desliga o módulo (insere a linha
 * com `enabled=false`) é que o hook retorna `false`, ativando o perfil
 * "só Mercado" (sidebar enxuta + home na Frente de Caixa).
 */
const cacheKey = (companyId: string) => `cardapio_enabled_${companyId}`;

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

export function useCardapioEnabled(companyId?: string | null) {
  // Default true para evitar flash da sidebar enxuta em lojas com cardápio.
  const [enabled, setEnabled] = useState<boolean>(() => readCache(companyId) ?? true);
  const [loading, setLoading] = useState(readCache(companyId) === null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setEnabled(true);
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
      .eq('module_name', 'cardapio')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // Sem linha → padrão TRUE (loja tem cardápio).
        const value = data ? !!data.enabled : true;
        setEnabled(value);
        setLoading(false);
        writeCache(companyId, value);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { enabled, loading };
}

export function clearCardapioCache(companyId?: string) {
  if (typeof window === 'undefined') return;
  try {
    if (companyId) {
      window.localStorage.removeItem(cacheKey(companyId));
    } else {
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('cardapio_enabled_')) {
          window.localStorage.removeItem(k);
        }
      }
    }
  } catch {
    /* ignore */
  }
}