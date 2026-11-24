import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidateStoreSettings } from '@/hooks/useStoreSettings';
import { activeStoreOverride, newStoreOverride, STORE_AVAILABILITY_KEY } from '../../supabase/functions/_shared/store-availability';
import { toast } from 'sonner';

export async function fetchStoreAvailability(companyId: string): Promise<string | null> {
  const { data, error } = await supabase.from('store_settings').select('value')
    .eq('company_id', companyId).eq('key', STORE_AVAILABILITY_KEY).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export function useStoreAvailability(companyId?: string | null) {
  const client = useQueryClient();
  const queryKey = ['store-availability', companyId];
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const query = useQuery({
    queryKey, enabled: !!companyId,
    queryFn: () => companyId ? fetchStoreAvailability(companyId) : Promise.resolve(null),
    staleTime: 0, refetchInterval: 10_000, refetchOnWindowFocus: 'always', retry: 1,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  async function setOpen(open: boolean) {
    if (!companyId || saving) return;
    setSaving(true);
    try {
      const value = JSON.stringify(newStoreOverride(open));
      const { data, error } = await supabase.from('store_settings').upsert({
        company_id: companyId, key: STORE_AVAILABILITY_KEY, value, updated_at: new Date().toISOString(),
      }, { onConflict: 'key,company_id' }).select('value').single();
      if (error || !data) throw error || new Error('Gravação não confirmada');
      client.setQueryData(queryKey, data.value);
      invalidateStoreSettings(companyId);
      toast.success(open ? 'Loja aberta hoje. Os horários normais voltam amanhã.' : 'Loja fechada hoje. Os horários normais voltam amanhã.');
    } catch {
      toast.error('Não foi possível alterar o estado da loja. Tente novamente.');
      await query.refetch();
    } finally { setSaving(false); }
  }
  return {
    value: query.data, override: activeStoreOverride(query.data, now), now, setOpen, saving,
    loading: !!companyId && query.isPending, error: query.isError, refetch: query.refetch,
  };
}