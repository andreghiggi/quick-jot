import { supabase } from '@/integrations/supabase/client';

export interface TabPaymentMutations {
  tabId: string;
  companyId: string;
  updates: Array<{ id: string; values: { paid?: boolean; quantity?: number; total_price?: number } }>;
  inserts: Array<{ id: string; tab_id: string; product_id: string | null; product_name: string;
    unit_price: number; quantity: number; total_price: number; created_by: string; notes?: string | null; paid: boolean }>;
}

/** Repeat the retained absolute updates and IDs, never recompute a paid fraction on retry. */
export async function applyTabPaymentMutations(plan: TabPaymentMutations): Promise<void> {
  const { data, error } = await supabase.from('tabs').select('id')
    .eq('id', plan.tabId).eq('company_id', plan.companyId).single();
  if (error || !data) throw error || new Error('Comanda não confirmada na loja atual.');
  for (const update of plan.updates) {
    const { data: rows, error: updateError } = await supabase.from('tab_items').update(update.values)
      .eq('id', update.id).eq('tab_id', plan.tabId).select('id');
    if (updateError || !rows?.length) throw updateError || new Error('Item pago não foi atualizado na comanda.');
  }
  if (plan.inserts.some(row => row.tab_id !== plan.tabId)) throw new Error('Item pertence a outra comanda.');
  if (plan.inserts.length) {
    const { error: insertError } = await supabase.from('tab_items')
      .upsert(plan.inserts, { onConflict: 'id', ignoreDuplicates: true });
    if (insertError) throw insertError;
  }
}