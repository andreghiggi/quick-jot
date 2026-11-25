/** Keep fiscal transport outside the paid-sale settlement boundary. */
export async function settleBeforeFiscal<T>(
  settle: () => Promise<T>,
  fiscal: (settlement: T) => Promise<unknown>,
): Promise<T> {
  const settlement = await settle();
  await fiscal(settlement);
  return settlement;
}

/** Only the configured integration, never a payment label, activates TEF. */
export function isIntegratedTef(integration?: string | null): integration is 'tef_pinpad' | 'tef_smartpos' {
  return integration === 'tef_pinpad' || integration === 'tef_smartpos';
}

export function expressCheckoutPolicy(input: {
  approvedTef: boolean;
  finalizeNow?: boolean;
  documentMode?: string;
  fiscalEnabled: boolean;
}) {
  const recordSale = input.approvedTef || !!input.finalizeNow || input.documentMode === 'sale_with_nfce';
  return { recordSale, emitNfce: recordSale && (input.approvedTef || (input.fiscalEnabled && input.documentMode === 'sale_with_nfce')) };
}