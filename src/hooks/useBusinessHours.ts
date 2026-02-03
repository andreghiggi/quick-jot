import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BusinessHour {
  id?: string;
  companyId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  isOpen: boolean;
  openTime: string | null; // HH:mm format
  closeTime: string | null; // HH:mm format
}

export interface BusinessHoursConfig {
  alwaysOpen: boolean;
  hours: BusinessHour[];
}

const DAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const DEFAULT_HOURS: Omit<BusinessHour, 'companyId'>[] = [
  { dayOfWeek: 0, isOpen: false, openTime: '08:00', closeTime: '22:00' },
  { dayOfWeek: 1, isOpen: true, openTime: '08:00', closeTime: '22:00' },
  { dayOfWeek: 2, isOpen: true, openTime: '08:00', closeTime: '22:00' },
  { dayOfWeek: 3, isOpen: true, openTime: '08:00', closeTime: '22:00' },
  { dayOfWeek: 4, isOpen: true, openTime: '08:00', closeTime: '22:00' },
  { dayOfWeek: 5, isOpen: true, openTime: '08:00', closeTime: '22:00' },
  { dayOfWeek: 6, isOpen: true, openTime: '08:00', closeTime: '22:00' },
];

interface UseBusinessHoursOptions {
  companyId?: string | null;
}

export function useBusinessHours(options: UseBusinessHoursOptions = {}) {
  const { companyId } = options;
  const [config, setConfig] = useState<BusinessHoursConfig>({
    alwaysOpen: true,
    hours: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchBusinessHours = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('business_hours')
        .select('*')
        .eq('company_id', companyId)
        .order('day_of_week');

      if (error) throw error;

      if (!data || data.length === 0) {
        // No config yet - default to always open
        setConfig({
          alwaysOpen: true,
          hours: DEFAULT_HOURS.map((h) => ({ ...h, companyId })),
        });
      } else {
        // Check if always_open is true (from first record)
        const alwaysOpen = data[0]?.always_open ?? true;
        
        const hours: BusinessHour[] = data.map((row) => ({
          id: row.id,
          companyId: row.company_id,
          dayOfWeek: row.day_of_week,
          isOpen: row.is_open,
          openTime: row.open_time,
          closeTime: row.close_time,
        }));

        setConfig({ alwaysOpen, hours });
      }
    } catch (error) {
      console.error('Error fetching business hours:', error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchBusinessHours();
  }, [fetchBusinessHours]);

  const saveBusinessHours = async (newConfig: BusinessHoursConfig): Promise<boolean> => {
    if (!companyId) return false;

    setSaving(true);
    try {
      // Delete existing records for this company
      await supabase
        .from('business_hours')
        .delete()
        .eq('company_id', companyId);

      // Insert new records
      const records = newConfig.hours.map((hour) => ({
        company_id: companyId,
        always_open: newConfig.alwaysOpen,
        day_of_week: hour.dayOfWeek,
        is_open: hour.isOpen,
        open_time: hour.openTime,
        close_time: hour.closeTime,
      }));

      const { error } = await supabase
        .from('business_hours')
        .insert(records);

      if (error) throw error;

      setConfig(newConfig);
      toast.success('Horários de atendimento salvos!');
      return true;
    } catch (error) {
      console.error('Error saving business hours:', error);
      toast.error('Erro ao salvar horários');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setAlwaysOpen = async (alwaysOpen: boolean): Promise<boolean> => {
    const newConfig = { ...config, alwaysOpen };
    
    // If switching to custom hours and no hours configured, create defaults
    if (!alwaysOpen && config.hours.length === 0) {
      newConfig.hours = DEFAULT_HOURS.map((h) => ({ ...h, companyId: companyId! }));
    }
    
    return saveBusinessHours(newConfig);
  };

  const updateDayHours = async (
    dayOfWeek: number,
    updates: Partial<Pick<BusinessHour, 'isOpen' | 'openTime' | 'closeTime'>>
  ): Promise<boolean> => {
    const newHours = config.hours.map((hour) =>
      hour.dayOfWeek === dayOfWeek ? { ...hour, ...updates } : hour
    );
    
    return saveBusinessHours({ ...config, hours: newHours });
  };

  // Check if currently open (for menu display)
  const isCurrentlyOpen = useCallback((): boolean => {
    if (config.alwaysOpen) return true;

    const now = new Date();
    // Use São Paulo timezone
    const spTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const dayOfWeek = spTime.getDay();
    const currentTime = `${String(spTime.getHours()).padStart(2, '0')}:${String(spTime.getMinutes()).padStart(2, '0')}`;

    const todayHours = config.hours.find((h) => h.dayOfWeek === dayOfWeek);
    
    if (!todayHours || !todayHours.isOpen) return false;
    if (!todayHours.openTime || !todayHours.closeTime) return false;

    return currentTime >= todayHours.openTime && currentTime <= todayHours.closeTime;
  }, [config]);

  return {
    config,
    loading,
    saving,
    setAlwaysOpen,
    updateDayHours,
    saveBusinessHours,
    isCurrentlyOpen,
    refetch: fetchBusinessHours,
    DAY_NAMES,
  };
}
