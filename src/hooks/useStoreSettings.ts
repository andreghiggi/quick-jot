import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StoreSettings {
  storePhone: string;
  bannerUrl: string;
  storeName: string;
  deliveryFeeCity: number;
  deliveryFeeInterior: number;
  deliveryMode: 'simple' | 'neighborhood';
  printerPaperSize: '58mm' | '80mm';
  showCardPedidosHoje: boolean;
  showCardAguardando: boolean;
  showCardFaturamento: boolean;
  showCardTotalPedidos: boolean;
  autoPrintSales: boolean;
  autoPrintNfce: boolean;
  menuLayout: 'v1' | 'v2';
  lateralScrollOptionals: boolean;
  enableDelivery: boolean;
  enablePickup: boolean;
  acceptOrderScheduling: boolean;
  floatingPhoto: boolean;
}

interface UseStoreSettingsOptions {
  companyId?: string | null;
}

export function useStoreSettings(options: UseStoreSettingsOptions = {}) {
  const { companyId } = options;
  const [settings, setSettings] = useState<StoreSettings>({
    storePhone: '',
    bannerUrl: '',
    storeName: 'Comanda Tech',
    deliveryFeeCity: 0,
    deliveryFeeInterior: 0,
    deliveryMode: 'simple',
    printerPaperSize: '58mm',
    showCardPedidosHoje: true,
    showCardAguardando: true,
    showCardFaturamento: true,
    showCardTotalPedidos: true,
    autoPrintSales: false,
    autoPrintNfce: false,
    menuLayout: 'v1',
    lateralScrollOptionals: false,
    enableDelivery: true,
    enablePickup: true,
    acceptOrderScheduling: false,
    floatingPhoto: false,
  });
  const [loading, setLoading] = useState(true);
  const isInitialLoadRef = useRef(true);

  async function fetchSettings() {
    if (!companyId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('store_settings')
        .select('*')
        .eq('company_id', companyId);

      if (error) throw error;

      const settingsMap: Record<string, string> = {};
      (data || []).forEach((item) => {
        settingsMap[item.key] = item.value || '';
      });

      setSettings({
        storePhone: settingsMap['store_phone'] || '',
        bannerUrl: settingsMap['banner_url'] || '',
        storeName: settingsMap['store_name'] || 'Comanda Tech',
        deliveryFeeCity: parseFloat(settingsMap['delivery_fee_city']) || 0,
        deliveryFeeInterior: parseFloat(settingsMap['delivery_fee_interior']) || 0,
        deliveryMode: (settingsMap['delivery_mode'] as 'simple' | 'neighborhood') || 'simple',
        printerPaperSize: (settingsMap['printer_paper_size'] as '58mm' | '80mm') || '58mm',
        showCardPedidosHoje: settingsMap['show_card_pedidos_hoje'] !== 'false',
        showCardAguardando: settingsMap['show_card_aguardando'] !== 'false',
        showCardFaturamento: settingsMap['show_card_faturamento'] !== 'false',
        showCardTotalPedidos: settingsMap['show_card_total_pedidos'] !== 'false',
        autoPrintSales: settingsMap['auto_print_sales'] === 'true',
        autoPrintNfce: settingsMap['auto_print_nfce'] === 'true',
        menuLayout: (settingsMap['menu_layout'] as 'v1' | 'v2') || 'v1',
        lateralScrollOptionals: settingsMap['lateral_scroll_optionals'] === 'true',
        enableDelivery: settingsMap['enable_delivery'] !== 'false',
        enablePickup: settingsMap['enable_pickup'] !== 'false',
        acceptOrderScheduling: settingsMap['accept_order_scheduling'] === 'true',
        floatingPhoto: settingsMap['floating_photo'] === 'true',
      });
    } catch (error) {
      console.error('Error fetching store settings:', error);
    } finally {
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
      }
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSettings();
  }, [companyId]);

  async function updateSetting(key: string, value: string): Promise<boolean> {
    try {
      if (!companyId) {
        toast.error('Empresa não identificada');
        return false;
      }

      // First check if setting exists for this company
      const { data: existing } = await supabase
        .from('store_settings')
        .select('id')
        .eq('key', key)
        .eq('company_id', companyId)
        .maybeSingle();

      if (existing) {
        // Update existing setting
        const { error } = await supabase
          .from('store_settings')
          .update({
            value,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new setting
        const { error } = await supabase
          .from('store_settings')
          .insert({
            key,
            value,
            company_id: companyId || null,
          });

        if (error) throw error;
      }

      await fetchSettings();
      return true;
    } catch (error) {
      console.error('Error updating setting:', error);
      toast.error('Erro ao salvar configuração');
      return false;
    }
  }

  async function saveStorePhone(phone: string): Promise<boolean> {
    const result = await updateSetting('store_phone', phone);
    if (result) {
      toast.success('Número salvo!');
    }
    return result;
  }

  async function saveBannerUrl(url: string): Promise<boolean> {
    const result = await updateSetting('banner_url', url);
    if (result) {
      toast.success('Banner salvo!');
    }
    return result;
  }

  async function saveStoreName(name: string): Promise<boolean> {
    const result = await updateSetting('store_name', name);
    if (result) {
      toast.success('Nome da loja salvo!');
    }
    return result;
  }

  async function saveDeliveryFeeCity(value: number): Promise<boolean> {
    const result = await updateSetting('delivery_fee_city', value.toString());
    if (result) {
      toast.success('Taxa cidade salva!');
    }
    return result;
  }

  async function saveDeliveryFeeInterior(value: number): Promise<boolean> {
    const result = await updateSetting('delivery_fee_interior', value.toString());
    if (result) {
      toast.success('Taxa interior salva!');
    }
    return result;
  }

  async function saveCardVisibility(cardKey: string, visible: boolean): Promise<boolean> {
    const result = await updateSetting(cardKey, visible.toString());
    return result;
  }

  return {
    settings,
    loading,
    saveStorePhone,
    saveBannerUrl,
    saveStoreName,
    saveDeliveryFeeCity,
    saveDeliveryFeeInterior,
    saveCardVisibility,
    updateSetting,
    refetch: fetchSettings,
  };
}
