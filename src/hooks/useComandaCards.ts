import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { COMANDA_CARDS_SETTING_KEY, isComandaCardsAllowed } from '@/utils/comandaIndividualAllowList';

/**
 * Estado do modo "cartões de comanda individuais".
 * allowed = loja na lista; enabled = opção ligada; active = ambos.
 * O servidor valida de novo em todas as ações.
 */
export function useComandaCards(companyId?: string | null) {
  const allowed = isComandaCardsAllowed(companyId);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(allowed);

  const load = useCallback(async () => {
    if (!companyId || !allowed) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('store_settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', COMANDA_CARDS_SETTING_KEY)
      .maybeSingle();
    setEnabled(data?.value === 'true');
    setLoading(false);
  }, [companyId, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const setEnabledRemote = useCallback(
    async (value: boolean) => {
      if (!companyId || !allowed) return false;
      const { data: existing } = await supabase
        .from('store_settings')
        .select('id')
        .eq('company_id', companyId)
        .eq('key', COMANDA_CARDS_SETTING_KEY)
        .maybeSingle();
      const res = existing
        ? await supabase.from('store_settings').update({ value: String(value) }).eq('id', existing.id)
        : await supabase
            .from('store_settings')
            .insert({ company_id: companyId, key: COMANDA_CARDS_SETTING_KEY, value: String(value) });
      if (res.error) return false;
      setEnabled(value);
      return true;
    },
    [companyId, allowed],
  );

  return { allowed, enabled, active: allowed && enabled, loading, setEnabled: setEnabledRemote, reload: load };
}
