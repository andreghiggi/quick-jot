/**
 * Constrói o link público do cardápio da loja.
 *
 * - Se a loja já tem subdomínio configurado (ex: "vanialanches"), retorna
 *   `https://vanialanches.comandatech.com.br` — link curto, sem cache antigo
 *   de preview do WhatsApp.
 * - Caso contrário, cai no formato legado `https://app.comandatech.com.br/cardapio/{slug}`.
 */
export function buildMenuLink(company: { subdomain?: string | null; slug?: string | null } | null | undefined): string {
  if (!company) return '';
  const sub = (company.subdomain || '').trim().toLowerCase();
  if (sub) return `https://${sub}.comandatech.com.br`;
  const slug = (company.slug || '').trim();
  if (!slug) return '';
  return `https://app.comandatech.com.br/cardapio/${slug}`;
}