import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StoreSettings {
  storePhone: string;
  bannerUrl: string;
  storeName: string;
  deliveryFeeCity: number;
  deliveryFeeInterior: number;
  showCardPedidosHoje: boolean;
  showCardAguardando: boolean;
  showCardFaturamento: boolean;
  showCardTotalPedidos: boolean;
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
    showCardPedidosHoje: true,
    showCardAguardando: true,
    showCardFaturamento: true,
    showCardTotalPedidos: true,
  });
  const [loading, setLoading] = useState(true);

  async function fetchSettings() {
    try {
      let query = supabase
        .from('store_settings')
        .select('*');

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;

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
        showCardPedidosHoje: settingsMap['show_card_pedidos_hoje'] !== 'false',
        showCardAguardando: settingsMap['show_card_aguardando'] !== 'false',
        showCardFaturamento: settingsMap['show_card_faturamento'] !== 'false',
        showCardTotalPedidos: settingsMap['show_card_total_pedidos'] !== 'false',
      });
    } catch (error) {
      console.error('Error fetching store settings:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSettings();
  }, [companyId]);

  async function updateSetting(key: string, value: string): Promise<boolean> {
    try {
      // First check if setting exists for this company
      let query = supabase
        .from('store_settings')
        .select('id')
        .eq('key', key);
      
      if (companyId) {
        query = query.eq('company_id', companyId);
      } else {
        query = query.is('company_id', null);
      }

      const { data: existing } = await query.maybeSingle();

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
