import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BusinessHourPeriod {
  id?: string;
  companyId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  periodNumber: number; // 1 = first period, 2 = second period
  isOpen: boolean;
  openTime: string | null; // HH:mm format
  closeTime: string | null; // HH:mm format
}

export interface DayConfig {
  dayOfWeek: number;
  isOpen: boolean;
  periods: { openTime: string; closeTime: string }[];
}

export interface BusinessHoursConfig {
  alwaysOpen: boolean;
  days: DayConfig[];
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

const DEFAULT_DAYS: Omit<DayConfig, 'companyId'>[] = [
  { dayOfWeek: 0, isOpen: false, periods: [{ openTime: '08:00', closeTime: '22:00' }] },
  { dayOfWeek: 1, isOpen: true, periods: [{ openTime: '08:00', closeTime: '22:00' }] },
  { dayOfWeek: 2, isOpen: true, periods: [{ openTime: '08:00', closeTime: '22:00' }] },
  { dayOfWeek: 3, isOpen: true, periods: [{ openTime: '08:00', closeTime: '22:00' }] },
  { dayOfWeek: 4, isOpen: true, periods: [{ openTime: '08:00', closeTime: '22:00' }] },
  { dayOfWeek: 5, isOpen: true, periods: [{ openTime: '08:00', closeTime: '22:00' }] },
  { dayOfWeek: 6, isOpen: true, periods: [{ openTime: '08:00', closeTime: '22:00' }] },
];

interface UseBusinessHoursOptions {
  companyId?: string | null;
}

export function useBusinessHours(options: UseBusinessHoursOptions = {}) {
  const { companyId } = options;
  const [config, setConfig] = useState<BusinessHoursConfig>({
    alwaysOpen: true,
    days: [],
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
        .order('day_of_week')
        .order('period_number');

      if (error) throw error;

      if (!data || data.length === 0) {
        // No config yet - default to always open
        setConfig({
          alwaysOpen: true,
          days: DEFAULT_DAYS,
        });
      } else {
        // Check if always_open is true (from first record)
        const alwaysOpen = data[0]?.always_open ?? true;
        
        // Group by day
        const dayMap = new Map<number, DayConfig>();
        
        for (let i = 0; i < 7; i++) {
          dayMap.set(i, { dayOfWeek: i, isOpen: false, periods: [] });
        }
        
        data.forEach((row) => {
          const day = dayMap.get(row.day_of_week)!;
          day.isOpen = row.is_open;
          if (row.open_time && row.close_time) {
            day.periods.push({
              openTime: row.open_time.substring(0, 5),
              closeTime: row.close_time.substring(0, 5),
            });
          }
        });
        
        // Ensure each day has at least one period
        dayMap.forEach((day) => {
          if (day.periods.length === 0) {
            day.periods.push({ openTime: '08:00', closeTime: '22:00' });
          }
        });

        const days = Array.from(dayMap.values()).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
        setConfig({ alwaysOpen, days });
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

      // Insert new records - one per period per day
      const records: any[] = [];
      
      newConfig.days.forEach((day) => {
        day.periods.forEach((period, periodIndex) => {
          records.push({
            company_id: companyId,
            always_open: newConfig.alwaysOpen,
            day_of_week: day.dayOfWeek,
            period_number: periodIndex + 1,
            is_open: day.isOpen,
            open_time: period.openTime,
            close_time: period.closeTime,
          });
        });
      });

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
    
    // If switching to custom hours and no days configured, create defaults
    if (!alwaysOpen && config.days.length === 0) {
      newConfig.days = DEFAULT_DAYS;
    }
    
    return saveBusinessHours(newConfig);
  };

  // Check if currently open (for menu display)
  const isCurrentlyOpen = useCallback((): boolean => {
    if (config.alwaysOpen) return true;

    const now = new Date();
    // Use São Paulo timezone
    const spTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const dayOfWeek = spTime.getDay();
    const currentTime = `${String(spTime.getHours()).padStart(2, '0')}:${String(spTime.getMinutes()).padStart(2, '0')}`;

    const todayConfig = config.days.find((d) => d.dayOfWeek === dayOfWeek);
    
    if (!todayConfig || !todayConfig.isOpen) return false;

    // Check if current time falls within any of the periods
    return todayConfig.periods.some((period) => {
      return currentTime >= period.openTime && currentTime <= period.closeTime;
    });
  }, [config]);

  // Get formatted hours for display
  const getFormattedHours = useCallback((): string => {
    if (config.alwaysOpen) return 'Aberto 24h';
    
    const now = new Date();
    const spTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const dayOfWeek = spTime.getDay();
    
    const todayConfig = config.days.find((d) => d.dayOfWeek === dayOfWeek);
    
    if (!todayConfig || !todayConfig.isOpen) return 'Fechado hoje';
    
    const periodsText = todayConfig.periods
      .map((p) => `${p.openTime} - ${p.closeTime}`)
      .join(' | ');
    
    return periodsText;
  }, [config]);

  return {
    config,
    loading,
    saving,
    setAlwaysOpen,
    saveBusinessHours,
    isCurrentlyOpen,
    getFormattedHours,
    refetch: fetchBusinessHours,
    DAY_NAMES,
    DEFAULT_DAYS,
  };
}
