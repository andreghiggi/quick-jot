/** Values remain in cents for settlement decisions; draft values are never paid lines. */
export interface InitialTabPayment {
  paymentMethodId: string;
  amount?: number;
}

export interface SplitTabPaymentDraft {
  extraItems: Array<{ id: string; product_id: string | null; product_name: string; quantity: number; unit_price: number; notes?: string }>;
  discount: number;
  initialPayment: InitialTabPayment;
}

export function paymentCents(value: number): number {
  return Math.round(value * 100);
}

export function splitChargeAllowed(total: number, paidAmounts: number[], amount: number, minimumPayments = 1): boolean {
  const remaining = paymentCents(total) - paidAmounts.reduce((sum, paid) => sum + paymentCents(paid), 0);
  const next = paymentCents(amount);
  return next > 0 && next <= remaining &&
    !(paidAmounts.length + 1 < minimumPayments && next === remaining);
}

export function splitSettlementComplete(total: number, paidAmounts: number[], minimumPayments = 1): boolean {
  return paymentCents(total) > 0 && paidAmounts.length >= minimumPayments &&
    paidAmounts.reduce((sum, paid) => sum + paymentCents(paid), 0) === paymentCents(total);
}

export function canCloseItemPayment(items: Array<{ paid?: boolean; quantity: number; unit_price: number; total_price?: number }>): boolean {
  const pending = items.filter(item => !item.paid);
  const residual = pending.reduce((sum, item) => sum + paymentCents(item.total_price ?? item.quantity * item.unit_price), 0);
  return residual <= 0 && !pending.some(item => item.quantity > 0 && item.unit_price >= 0);
}