import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_SAME_DAY, fetchSameDayConfig, patchSameDayConfig, saveDeliveryToday,
  type FloristSameDayConfig,
} from '@/lib/floristSameDay';

/** One tenant-scoped cache for settings, quick controls and the public catalog. */
export function useFloristSameDay(companyId?: string | null, enabled = true) {
  const client = useQueryClient();
  const queryKey = ['florist-same-day', companyId];
  const [now, setNow] = useState(() => new Date());
  const active = enabled && !!companyId;
  const query = useQuery({
    queryKey, enabled: active,
    queryFn: () => companyId ? fetchSameDayConfig(companyId) : Promise.reject(new Error('Loja não encontrada')),
    staleTime: 0, refetchInterval: 10_000, refetchOnWindowFocus: 'always', retry: 1,
  });
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, [active]);
  const mutation = useMutation({
    mutationKey: ['florist-same-day-write', companyId],
    scope: { id: `florist-same-day-${companyId}` },
    mutationFn: async (change: Partial<FloristSameDayConfig> | boolean) => {
      if (!companyId || !enabled) throw new Error('Loja não encontrada');
      await client.cancelQueries({ queryKey });
      return typeof change === 'boolean'
        ? saveDeliveryToday(companyId, change)
        : patchSameDayConfig(companyId, change);
    },
    onSuccess: (config) => client.setQueryData(queryKey, config),
    onSettled: () => { void client.invalidateQueries({ queryKey }); },
  });
  const config = active && (query.isPending || query.isError)
    ? { ...(query.data ?? DEFAULT_SAME_DAY), sameDayDelivery: false }
    : query.data ?? DEFAULT_SAME_DAY;
  return {
    config, now, loading: active && query.isPending, failed: query.isError,
    saving: mutation.isPending, refetch: query.refetch,
    save: (patch: Partial<FloristSameDayConfig>) => mutation.mutateAsync(patch),
    setDeliveryOpen: (open: boolean) => mutation.mutateAsync(open),
  };
}