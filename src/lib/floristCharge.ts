// Regras de cobrança dos pedidos — SOMENTE perfil floricultura.
// Floricultura cobra na entrada, na produção, na saída ou depois da entrega:
// o botão Cobrar não depende da etapa nem de ser retirada.

export function floristCanCharge(params: { chargeEnabled: boolean; origin?: string | null; status: string; cancelled?: boolean }): boolean {
  const origin = params.origin || 'cardapio';
  return params.chargeEnabled
    && (origin === 'cardapio' || origin === 'balcao')
    && params.status !== 'canceled'
    && !params.cancelled;
}

/** Entrega que sai ou é concluída sem cobrança pede confirmação, sem bloquear. */
export function floristUnpaidDeliveryWarning(params: { mode: 'delivery' | 'pickup'; target: string; unpaid: boolean }): boolean {
  return params.unpaid && params.mode === 'delivery'
    && (params.target === 'out_for_delivery' || params.target === 'delivered');
}
