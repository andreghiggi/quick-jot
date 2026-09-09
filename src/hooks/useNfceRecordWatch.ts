import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Realtime watch on a single nfce_records row (webhook/edge updates DB → UI reacts).
 */
export function useNfceRecordWatch(
  recordId: string | undefined,
  onUpdate: (record: Record<string, unknown>) => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !recordId) return;

    const channel = supabase
      .channel(`nfce-record-${recordId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'nfce_records',
          filter: `id=eq.${recordId}`,
        },
        (payload) => {
          if (payload.new) onUpdate(payload.new as Record<string, unknown>);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [recordId, enabled, onUpdate]);
}
