import { supabase } from '@/integrations/supabase/client';

export interface FastSaleDraft {
  sale: {
    id: string; company_id: string; cash_register_id: string; payment_method_id: string | null;
    total: number; discount: number; final_total: number; notes: string | null; created_by: string;
    customer_name?: string | null;
    order_id?: string;
    fiscal_mode?: 'fiscal' | 'nao_fiscal';
    source_module?: 'pdv' | 'mercado';
  };
  items: Array<{
    id: string; sale_id: string; product_id: string | null; product_name: string;
    quantity: number; unit_price: number; total_price: number;
  }>;
}

/** Retain client-generated IDs so an uncertain response cannot duplicate a sale or its items. */
export async function persistFastSale(draft: FastSaleDraft): Promise<string> {
  const { error: saleError } = await supabase.from('pdv_sales')
    .upsert(draft.sale, { onConflict: 'id', ignoreDuplicates: true });
  if (saleError) throw saleError;
  const { data, error: readError } = await supabase.from('pdv_sales').select('id')
    .eq('id', draft.sale.id).eq('company_id', draft.sale.company_id)
    .eq('cash_register_id', draft.sale.cash_register_id).single();
  if (readError || !data) throw readError || new Error('Venda não confirmada. Não cobre novamente.');
  const { error: itemsError } = await supabase.from('pdv_sale_items')
    .upsert(draft.items, { onConflict: 'id', ignoreDuplicates: true });
  if (itemsError) throw itemsError;
  return data.id;
}