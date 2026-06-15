import { supabase } from '@/integrations/supabase/client';
import { printCashClosingDetailed } from '@/utils/cashClosingPrint';
import type { CloseCashSale } from '@/components/pdv-v2/PDVV2CloseCashDialog';
import { getExpectedCashDrawer, loadCashClosingSales } from '@/utils/cashClosingSales';

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
  const mappedSales: CloseCashSale[] = await loadCashClosingSales({
    companyId,
    registerId,
    openedAt: (reg as any)?.opened_at,
    closedAt: (reg as any)?.closed_at,
  });

  // 4) Movimentações manuais (sangria/suprimento)
  const { data: movs } = await supabase
    .from('cash_movements')
    .select('type, amount, reason, created_at')
    .eq('cash_register_id', registerId)
    .order('created_at', { ascending: true });

  // 5) Caixa físico (Dinheiro = vendas em dinheiro + abertura + suprimentos − sangrias)
  const opening = Number((reg as any)?.opening_amount || 0);
  const systemCash = getExpectedCashDrawer(opening, mappedSales, (movs || []) as any);
  const operatorCash = (reg as any)?.closing_amount != null ? Number((reg as any).closing_amount) : 0;

  // Valor esperado no caixa físico: abertura + dinheiro recebido + suprimentos − sangrias.
  const expected = systemCash;

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