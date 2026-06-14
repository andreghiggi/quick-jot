/**
 * Expande uma lista de CloseCashSale substituindo cada venda que tem
 * splits gravados em `pdv_sale_payments` por uma linha por forma de
 * pagamento. Vendas sem split ficam intactas.
 *
 * Usado pelo relatório de fechamento (impressão e tela) para que
 * vendas em multi-pagamento apareçam corretamente em cada forma.
 */
import { supabase } from '@/integrations/supabase/client';

export type SplittableSale = {
  id: string;
  final_total: number;
  payment_method_id: string | null;
  payment_method_name: string;
  customer_name: string | null;
  created_at: string;
  origin: any;
};

export async function expandSalesWithSplits<T extends SplittableSale>(
  sales: T[],
): Promise<T[]> {
  if (!sales?.length) return sales;
  const ids = sales.map((s) => s.id);
  const { data: splits, error } = await supabase
    .from('pdv_sale_payments')
    .select('sale_id, payment_method_id, payment_method_name, amount')
    .in('sale_id', ids);
  if (error) {
    console.error('[expandSalesWithSplits]', error);
    return sales;
  }
  if (!splits?.length) return sales;
  const bySale = new Map<string, typeof splits>();
  for (const sp of splits) {
    const arr = bySale.get(sp.sale_id) || [];
    arr.push(sp);
    bySale.set(sp.sale_id, arr);
  }
  const result: T[] = [];
  for (const s of sales) {
    const sp = bySale.get(s.id);
    if (!sp?.length) {
      result.push(s);
      continue;
    }
    sp.forEach((line, idx) => {
      result.push({
        ...s,
        // Mantém o mesmo id base (com sufixo) só para keys de UI.
        id: `${s.id}__${idx}`,
        final_total: Number(line.amount) || 0,
        payment_method_id: line.payment_method_id || null,
        payment_method_name: line.payment_method_name || 'Sem forma',
      });
    });
  }
  return result;
}