import type { Order } from '@/types/order';

/** Liberado para todas as lojas (piloto I9 aprovado). Ativação controlada pela toggle de cada loja. */
export function isAutoConfirmAllowedCompany(companyId?: string | null): boolean {
  return !!companyId;
}

/** Pedido do cardápio online, pendente, com telefone, ainda não confirmado e recente (até 30 min). */
export function isAutoConfirmCandidate(order: Order, now: number = Date.now()): boolean {
  if (order.status !== 'pending') return false;
  if (order.confirmedAt) return false;
  if (!order.customerPhone) return false;
  if ((order.origin || 'cardapio') !== 'cardapio') return false;
  return now - order.createdAt.getTime() <= 30 * 60 * 1000;
}
