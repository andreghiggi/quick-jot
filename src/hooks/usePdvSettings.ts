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
  // Fase A — novos toggles (Gweb-like)
  cash_control_enabled: boolean;
  blind_close_enabled: boolean;
  require_movement_reason: boolean;
  block_sale_without_price: boolean;
  allow_price_change_on_sale: boolean;
  confirm_quantity_above: number;
  auto_print_on_finish: boolean;
  auto_open_drawer_cash: boolean;
  clear_screen_after_sale: boolean;
  auto_print_second_copy: boolean;
  print_show_logo: boolean;
  print_show_review_qr: boolean;
  review_qr_url: string;
  block_close_with_pending_sales: boolean;
  auto_print_closing_report: boolean;
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
  cash_control_enabled: true,
  blind_close_enabled: false,
  require_movement_reason: false,
  block_sale_without_price: true,
  allow_price_change_on_sale: true,
  confirm_quantity_above: 10,
  auto_print_on_finish: false,
  auto_open_drawer_cash: false,
  clear_screen_after_sale: true,
  auto_print_second_copy: false,
  print_show_logo: true,
  print_show_review_qr: false,
  review_qr_url: '',
  block_close_with_pending_sales: false,
  auto_print_closing_report: false,
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
        cash_control_enabled: (data as any).cash_control_enabled ?? true,
        blind_close_enabled: !!(data as any).blind_close_enabled,
        require_movement_reason: !!(data as any).require_movement_reason,
        block_sale_without_price: (data as any).block_sale_without_price ?? true,
        allow_price_change_on_sale: (data as any).allow_price_change_on_sale ?? true,
        confirm_quantity_above: Number((data as any).confirm_quantity_above ?? 10),
        auto_print_on_finish: !!(data as any).auto_print_on_finish,
        auto_open_drawer_cash: !!(data as any).auto_open_drawer_cash,
        clear_screen_after_sale: (data as any).clear_screen_after_sale ?? true,
        auto_print_second_copy: !!(data as any).auto_print_second_copy,
        print_show_logo: (data as any).print_show_logo ?? true,
        print_show_review_qr: !!(data as any).print_show_review_qr,
        review_qr_url: (data as any).review_qr_url ?? '',
        block_close_with_pending_sales: !!(data as any).block_close_with_pending_sales,
        auto_print_closing_report: !!(data as any).auto_print_closing_report,
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