import type { Order } from '@/types/order';

/** Piloto: apenas Lancheria da I9 até validação. */
export const AUTO_CONFIRM_PILOT_COMPANY_IDS = ['8c9e7a0e-dbb6-49b9-8344-c23155a71164'];

export function isAutoConfirmAllowedCompany(companyId?: string | null): boolean {
  return !!companyId && AUTO_CONFIRM_PILOT_COMPANY_IDS.includes(companyId);
}

/** Pedido do cardápio online, pendente, com telefone, ainda não confirmado e recente (até 30 min). */
export function isAutoConfirmCandidate(order: Order, now: number = Date.now()): boolean {
  if (order.status !== 'pending') return false;
  if (order.confirmedAt) return false;
  if (!order.customerPhone) return false;
  if ((order.origin || 'cardapio') !== 'cardapio') return false;
  return now - order.createdAt.getTime() <= 30 * 60 * 1000;
}
