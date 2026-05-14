// Allow-list para a feature "Editar Pedido" (rollout isolado).
// Atualmente liberada APENAS para Lancheria da i9.
// Não alterar sem autorização explícita.

export const ORDER_EDIT_ALLOWED_COMPANY_IDS: string[] = [
  '8c9e7a0e-dbb6-49b9-8344-c23155a71164', // Lancheria da i9
];

export function isOrderEditAllowed(companyId?: string | null): boolean {
  if (!companyId) return false;
  return ORDER_EDIT_ALLOWED_COMPANY_IDS.includes(companyId);
}