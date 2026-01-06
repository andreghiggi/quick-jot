import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StoreSettings {
  storePhone: string;
  bannerUrl: string;
  storeName: string;
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
      // Try to upsert the setting
      const { error } = await supabase
        .from('store_settings')
        .upsert({
          key,
          value,
          company_id: companyId || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'key',
        });

      if (error) throw error;

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

  return {
    settings,
    loading,
    saveStorePhone,
    saveBannerUrl,
    saveStoreName,
    refetch: fetchSettings,
  };
}
