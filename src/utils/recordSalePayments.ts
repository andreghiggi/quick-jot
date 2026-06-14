/**
 * Grava as formas de pagamento divididas (multi-pagamento) de uma venda
 * em `pdv_sale_payments`. Usado APENAS pelos 3 fluxos de multi-payment
 * (PedidoExpress, OrderCardChargeDialog, PDV V2 importar/cobrar).
 *
 * Vendas single-payment continuam sem registrar split — o relatório
 * de fechamento usa o `payment_method_id` da própria `pdv_sales` nesse caso.
 *
 * Falhas aqui são apenas logadas: nunca devem reverter a venda já gravada.
 */
import { supabase } from '@/integrations/supabase/client';
import type { MultiPaymentResolvedLine } from '@/utils/pdvV2MultiPayment';

export async function recordSalePayments(
  saleId: string,
  companyId: string,
  lines: MultiPaymentResolvedLine[],
): Promise<void> {
  if (!saleId || !companyId || !lines?.length) return;
  try {
    const rows = lines.map((l) => ({
      sale_id: saleId,
      company_id: companyId,
      payment_method_id: l.payment_method_id || null,
      payment_method_name: l.payment_name || 'Sem forma',
      amount: Number(l.amount) || 0,
      integration: l.integration || null,
    }));
    const { error } = await supabase.from('pdv_sale_payments').insert(rows);
    if (error) console.error('[recordSalePayments] insert error', error);
  } catch (e) {
    console.error('[recordSalePayments] unexpected', e);
  }
}