interface TefPaymentMethodLike {
  active?: boolean | null;
  integration_type?: string | null;
}

interface TefChargeFlowOptions {
  companyId?: string | null;
  fiscalEnabled: boolean;
  hasTefPaymentMethod: boolean;
}

interface LightNfceOverlayOptions {
  companyId?: string | null;
  fiscalEnabled: boolean;
  isI9Company: boolean;
}

/** Verifica se a empresa possui ao menos uma forma TEF ativa. */
export function hasActiveTefPaymentMethod(
  paymentMethods: readonly TefPaymentMethodLike[],
): boolean {
  return paymentMethods.some((method) => {
    const integration = method.integration_type?.trim().toLowerCase();
    return method.active !== false && (integration === 'tef_pinpad' || integration === 'tef_smartpos');
  });
}

/**
 * No fluxo fiscal com TEF, cobra primeiro para que os diálogos de CPF/NFC-e
 * não escondam nem interrompam a operação já iniciada no PinPad.
 */
export function shouldChargeTefBeforePopups({
  companyId,
  fiscalEnabled,
  hasTefPaymentMethod,
}: TefChargeFlowOptions): boolean {
  return Boolean(companyId && fiscalEnabled && hasTefPaymentMethod);
}

/** Mantém o indicador discreto exclusivo da Lancheria da I9. */
export function useLightNfceEmitOverlay({
  companyId,
  fiscalEnabled,
  isI9Company,
}: LightNfceOverlayOptions): boolean {
  return Boolean(companyId && fiscalEnabled && isI9Company);
}