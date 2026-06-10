import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PdvSettings {
  promo_message: string;
  print_show_customer: boolean;
  print_show_discount: boolean;
  print_show_surcharge: boolean;
  print_show_serial: boolean;
  print_show_sale_notes: boolean;
  print_show_product_notes: boolean;
  require_customer_above_value: number;
}

export const PDV_SETTINGS_DEFAULTS: PdvSettings = {
  promo_message: '',
  print_show_customer: true,
  print_show_discount: true,
  print_show_surcharge: true,
  print_show_serial: false,
  print_show_sale_notes: true,
  print_show_product_notes: true,
  require_customer_above_value: 0,
};

/**
 * Hook para ler/salvar as configurações da Frente de Caixa (tabela `pdv_settings`).
 *
 * IMPORTANTE: este hook só serve a Frente de Caixa (módulo `mercado`).
 * Nada do PDV V2, Pedido Express, Cobrança, TEF ou impressão de pedidos
 * online deve consumir essa tabela.
 */
export function usePdvSettings(companyId?: string | null) {
  const [settings, setSettings] = useState<PdvSettings>(PDV_SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setSettings(PDV_SETTINGS_DEFAULTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('pdv_settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) {
      console.error('[usePdvSettings] load error', error);
    }
    if (data) {
      setSettings({
        promo_message: data.promo_message ?? '',
        print_show_customer: !!data.print_show_customer,
        print_show_discount: !!data.print_show_discount,
        print_show_surcharge: !!data.print_show_surcharge,
        print_show_serial: !!data.print_show_serial,
        print_show_sale_notes: !!data.print_show_sale_notes,
        print_show_product_notes: !!data.print_show_product_notes,
        require_customer_above_value: Number(data.require_customer_above_value ?? 0),
      });
    } else {
      setSettings(PDV_SETTINGS_DEFAULTS);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (next: PdvSettings) => {
      if (!companyId) return { error: new Error('Sem empresa') };
      setSaving(true);
      const payload = { company_id: companyId, ...next };
      const { error } = await supabase
        .from('pdv_settings')
        .upsert(payload, { onConflict: 'company_id' });
      setSaving(false);
      if (!error) setSettings(next);
      return { error };
    },
    [companyId],
  );

  return { settings, setSettings, loading, saving, save, reload: load };
}