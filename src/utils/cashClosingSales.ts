import { supabase } from '@/integrations/supabase/client';
import type { CloseCashSale } from '@/components/pdv-v2/PDVV2CloseCashDialog';
import { expandSalesWithSplits } from '@/utils/expandSalesWithSplits';

type CashMovement = { type: string; amount: number | string | null };

export function isCashPaymentMethodName(name?: string | null) {
  return /dinheiro/i.test(name || '');
}

export function getCashSalesTotal(sales: CloseCashSale[]) {
  return sales
    .filter((s) => isCashPaymentMethodName(s.payment_method_name))
    .reduce((acc, s) => acc + (Number(s.final_total) || 0), 0);
}

export function getExpectedCashDrawer(
  openingAmount: number,
  sales: CloseCashSale[],
  movements: CashMovement[] = [],
) {
  const suprimentos = movements
    .filter((m) => m.type === 'suprimento')
    .reduce((acc, m) => acc + Number(m.amount || 0), 0);
  const sangrias = movements
    .filter((m) => m.type === 'sangria')
    .reduce((acc, m) => acc + Number(m.amount || 0), 0);
  return Number(openingAmount || 0) + getCashSalesTotal(sales) + suprimentos - sangrias;
}

function originFromOrder(order: { origin?: string | null; delivery_address?: string | null }): CloseCashSale['origin'] {
  if (order.origin === 'mesa' || order.origin === 'mesa_qr') return 'mesa';
  if (order.origin === 'balcao') return 'balcao';
  return order.delivery_address && order.delivery_address.trim().length > 0
    ? 'cardapio_delivery'
    : 'cardapio_retirada';
}

function paymentNameFromNotes(notes?: string | null): string | null {
  const paymentMatch = notes?.match(/Pagamento:\s*([^|()\n]*)/i);
  const paymentName = paymentMatch?.[1]?.trim();
  return paymentName || null;
}

function appendTefSubtype(paymentName: string, notes?: string | null) {
  const tefMatch = notes?.match(/\|\s*(Débito|Crédito à Vista|PIX|\d+x\s*(?:Cartão\s*(?:ADM|Loja)|Crédito))/i);
  return tefMatch ? `${paymentName} (${tefMatch[1]})` : paymentName;
}

export async function loadCashClosingSales(params: {
  companyId: string;
  registerId: string;
  openedAt?: string | null;
  closedAt?: string | null;
}): Promise<CloseCashSale[]> {
  const { companyId, registerId, openedAt, closedAt } = params;

  const { data: sales, error } = await supabase
    .from('pdv_sales')
    .select('id, final_total, payment_method_id, customer_name, notes, created_at, order_id, payment_method:payment_methods(name)')
    .eq('cash_register_id', registerId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: paymentMethods, error: paymentMethodsError } = await supabase
    .from('payment_methods')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('active', true);
  if (paymentMethodsError) throw paymentMethodsError;
  const paymentMethodNames = ((paymentMethods || []) as Array<{ name: string | null }>).map((pm) => pm.name).filter(Boolean) as string[];

  const orderIds = Array.from(new Set((sales || []).map((s: any) => s.order_id).filter(Boolean)));
  let ordersMap = new Map<string, { origin: string; delivery_address: string | null; notes: string | null }>();
  if (orderIds.length) {
    const { data: ord } = await supabase
      .from('orders')
      .select('id, origin, delivery_address, notes')
      .in('id', orderIds);
    ordersMap = new Map((ord || []).map((o: any) => [o.id, { origin: o.origin, delivery_address: o.delivery_address, notes: o.notes }]));
  }

  const base: CloseCashSale[] = (sales || []).flatMap((s: any) => {
    const saleCancelled = !!s.notes?.includes('[CANCELADA]');
    const linkedOrder = s.order_id ? ordersMap.get(s.order_id) : undefined;
    if (saleCancelled || linkedOrder?.notes?.includes('[CANCELADA]')) return [];

    const pmName = appendTefSubtype(s.payment_method?.name || paymentNameFromNotes(s.notes) || 'Sem forma', s.notes);

    return [{
      id: s.id,
      final_total: Number(s.final_total) || 0,
      payment_method_id: s.payment_method_id || null,
      payment_method_name: pmName,
      customer_name: s.customer_name || null,
      created_at: s.created_at,
      origin: s.order_id && linkedOrder ? originFromOrder(linkedOrder) : (s.notes?.toLowerCase().includes('comanda') ? 'mesa' : 'balcao'),
    }];
  });

  const mapped = await expandSalesWithSplits(base);

  if (!openedAt) return mapped;
  let missingQuery = supabase
    .from('orders')
    .select('id, total, paid_amount, payment_status, customer_name, created_at, updated_at, origin, delivery_address, notes, status')
    .eq('company_id', companyId)
    .eq('status', 'delivered')
    .gte('updated_at', openedAt)
    .or('payment_status.in.(paid,partial),notes.ilike.%Pagamento:%');
  if (closedAt) missingQuery = missingQuery.lte('updated_at', closedAt);

  const { data: missingOrders, error: missingError } = await missingQuery;
  if (missingError) throw missingError;

  const soldOrderIds = new Set(orderIds);
  const missingCashSales: CloseCashSale[] = (missingOrders || [])
    .filter((o: any) => !soldOrderIds.has(o.id) && !o.notes?.includes('[CANCELADA]'))
    .map((o: any) => {
      const paidAmount = Number(o.paid_amount || 0);
      const amount = o.payment_status === 'partial' && paidAmount > 0 ? paidAmount : Number(o.total || 0);
      return {
        id: `order-${o.id}`,
        final_total: amount,
        payment_method_id: null,
        payment_method_name: paymentNameFromNotes(o.notes) || paymentMethodNames.find((name) => o.notes?.toLowerCase().includes(name.toLowerCase())) || 'Sem forma',
        customer_name: o.customer_name || null,
        created_at: o.updated_at || o.created_at,
        origin: originFromOrder(o),
      };
    })
    .filter((s: CloseCashSale) => Number(s.final_total || 0) > 0);

  return [...mapped, ...missingCashSales];
}