import { supabase } from '@/integrations/supabase/client';
import { printCashClosingDetailed } from '@/utils/cashClosingPrint';
import type { CloseCashSale } from '@/components/pdv-v2/PDVV2CloseCashDialog';

/**
 * Carrega tudo necessário (empresa, vendas, movimentações, dados do caixa)
 * e imprime o Relatório de Fechamento detalhado para o caixa informado.
 *
 * Usado pelo rail lateral do Frente de Caixa (item "Rel. de fechamento").
 * Reutiliza `printCashClosingDetailed` e passa os blocos extras:
 *  - Cabeçalho fiscal (Fantasia/CNPJ/Endereço/Telefone)
 *  - Movimentações Manuais (Sangria/Suprimento com motivo)
 *  - Caixa Físico (Sistema × Operador × Diferença por espécie)
 *
 * NÃO mexe em PDV V2, CashReport, fechamento de caixa nem em TEF.
 */
export async function printCurrentCashClosing(params: {
  companyId: string;
  registerId: string;
  paperSize?: '58mm' | '80mm';
  blindClose?: boolean;
}) {
  const { companyId, registerId, paperSize = '80mm', blindClose = false } = params;

  // 1) Empresa (cabeçalho fiscal)
  const { data: company } = await supabase
    .from('companies')
    .select(
      'name, razao_social, cnpj, phone, address, address_street, address_number, address_neighborhood, address_city, address_state'
    )
    .eq('id', companyId)
    .maybeSingle();

  const fullAddress =
    (company as any)?.address ||
    [
      (company as any)?.address_street,
      (company as any)?.address_number,
      (company as any)?.address_neighborhood,
      (company as any)?.address_city && (company as any)?.address_state
        ? `${(company as any).address_city}/${(company as any).address_state}`
        : (company as any)?.address_city || (company as any)?.address_state,
    ]
      .filter(Boolean)
      .join(', ') || null;

  // 2) Caixa
  const { data: reg } = await supabase
    .from('cash_registers')
    .select('*')
    .eq('id', registerId)
    .maybeSingle();

  // 3) Vendas (mesma lógica usada em CashReport.tsx)
  const { data: sales } = await supabase
    .from('pdv_sales')
    .select(
      'id, final_total, payment_method_id, customer_name, notes, created_at, order_id, payment_method:payment_methods(name)'
    )
    .eq('cash_register_id', registerId)
    .order('created_at', { ascending: false });

  const orderIds = Array.from(new Set((sales || []).map((s: any) => s.order_id).filter(Boolean)));
  let ordersMap = new Map<string, { origin: string; delivery_address: string | null; notes: string | null }>();
  if (orderIds.length) {
    const { data: ord } = await supabase
      .from('orders')
      .select('id, origin, delivery_address, notes')
      .in('id', orderIds);
    ordersMap = new Map(
      (ord || []).map((o: any) => [
        o.id,
        { origin: o.origin, delivery_address: o.delivery_address, notes: o.notes },
      ]),
    );
  }

  const baseSales: CloseCashSale[] = (sales || []).flatMap((s: any) => {
    const saleCancelled = !!s.notes?.includes('[CANCELADA]');
    const linkedOrder = s.order_id ? ordersMap.get(s.order_id) : undefined;
    if (saleCancelled || linkedOrder?.notes?.includes('[CANCELADA]')) return [];
    let origin: CloseCashSale['origin'] = 'balcao';
    let pmName = s.payment_method?.name || 'Sem forma';
    if (s.notes) {
      const tefMatch = s.notes.match(
        /\|\s*(Débito|Crédito à Vista|PIX|\d+x\s*(?:Cartão\s*(?:ADM|Loja)|Crédito))/i,
      );
      if (tefMatch) pmName = `${pmName} (${tefMatch[1]})`;
    }
    if (s.order_id) {
      if (linkedOrder) {
        if (linkedOrder.origin === 'mesa') origin = 'mesa';
        else if (linkedOrder.origin === 'balcao') origin = 'balcao';
        else
          origin =
            linkedOrder.delivery_address && linkedOrder.delivery_address.trim().length > 0
              ? 'cardapio_delivery'
              : 'cardapio_retirada';
      } else {
        origin = 'outros';
      }
    } else {
      if (s.notes?.toLowerCase().includes('comanda')) origin = 'mesa';
      else origin = 'balcao';
    }
    return [
      {
        id: s.id,
        final_total: Number(s.final_total) || 0,
        payment_method_id: s.payment_method_id || null,
        payment_method_name: pmName,
        customer_name: s.customer_name || null,
        created_at: s.created_at,
        origin,
      },
    ];
  });
  // Expande vendas multi-pagamento em uma linha por forma usando pdv_sale_payments.
  const { expandSalesWithSplits } = await import('@/utils/expandSalesWithSplits');
  const mappedSales: CloseCashSale[] = await expandSalesWithSplits(baseSales);

  // 4) Movimentações manuais (sangria/suprimento)
  const { data: movs } = await supabase
    .from('cash_movements')
    .select('type, amount, reason, created_at')
    .eq('cash_register_id', registerId)
    .order('created_at', { ascending: true });

  // 5) Caixa físico (Dinheiro = vendas em dinheiro + abertura + suprimentos − sangrias)
  const cashSales = mappedSales
    .filter((s) => /dinheiro/i.test(s.payment_method_name))
    .reduce((acc, s) => acc + s.final_total, 0);
  const suprimentos = (movs || [])
    .filter((m) => m.type === 'suprimento')
    .reduce((a, m) => a + Number(m.amount || 0), 0);
  const sangrias = (movs || [])
    .filter((m) => m.type === 'sangria')
    .reduce((a, m) => a + Number(m.amount || 0), 0);
  const opening = Number((reg as any)?.opening_amount || 0);
  const systemCash = opening + cashSales + suprimentos - sangrias;
  const operatorCash = (reg as any)?.closing_amount != null ? Number((reg as any).closing_amount) : 0;

  // Valor esperado em caixa (igual à lógica do CashReport)
  const expected =
    (reg as any)?.expected_amount != null
      ? Number((reg as any).expected_amount)
      : opening + mappedSales.reduce((a, s) => a + s.final_total, 0);

  printCashClosingDetailed({
    companyName: (company as any)?.name || 'LOJA',
    paperSize,
    expectedAmount: expected,
    sales: mappedSales,
    blindClose,
    registerInfo: reg
      ? {
          openedAt: (reg as any).opened_at,
          closedAt: (reg as any).closed_at,
          openingAmount: (reg as any).opening_amount,
          closingAmount: (reg as any).closing_amount,
          difference: (reg as any).difference,
          operatorName: (reg as any).operator_name,
          notes: (reg as any).notes,
          status: (reg as any).status,
        }
      : undefined,
    fiscalHeader: {
      fantasia: (company as any)?.name || null,
      cnpj: (company as any)?.cnpj || null,
      address: fullAddress,
      phone: (company as any)?.phone || null,
    },
    cashMovements: (movs || []).map((m: any) => ({
      type: m.type,
      amount: Number(m.amount || 0),
      reason: m.reason,
      created_at: m.created_at,
    })),
    physicalCash: [
      { species: 'DINHEIRO', systemAmount: systemCash, operatorAmount: operatorCash },
    ],
  });
}