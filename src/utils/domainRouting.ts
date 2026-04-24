/**
 * Lógica de detecção de domínio/subdomínio para o Comanda Tech.
 *
 * Domínios suportados:
 *  - comandatech.com.br             → domínio raiz, redireciona para app.
 *  - app.comandatech.com.br         → painel administrativo (todas as rotas atuais)
 *  - {loja}.comandatech.com.br      → cardápio público da loja
 *  - appcomandatech.agilizeerp.com.br → domínio antigo, segue funcionando
 *  - localhost / lovable.app / vercel.app → ambientes de desenvolvimento (painel admin)
 */

export const COMANDATECH_ROOT = 'comandatech.com.br';
export const LEGACY_HOST = 'appcomandatech.agilizeerp.com.br';

// Subdomínios reservados para o sistema (não são lojas)
export const RESERVED_SUBDOMAINS = new Set([
  'app',
  'www',
  'admin',
  'api',
  'cardapio',
  'painel',
  'mail',
  'blog',
  'ftp',
  'webmail',
  'comandatech',
  'root',
  'test',
  'staging',
  'dev',
  'support',
  'suporte',
  'help',
  'status',
  'docs',
  'assets',
  'static',
  'cdn',
  'auth',
  'login',
  'dashboard',
  'portal',
]);

export type DomainContext =
  | { kind: 'admin' } // painel administrativo (rotas atuais)
  | { kind: 'store'; subdomain: string } // cardápio de uma loja específica
  | { kind: 'root-redirect' } // raiz comandatech.com.br → redirecionar para app.
  | { kind: 'legacy' }; // domínio antigo (appcomandatech.agilizeerp.com.br)

/**
 * Determina o contexto de domínio com base no hostname atual.
 */
export function detectDomainContext(hostname: string = window.location.hostname): DomainContext {
  const host = hostname.toLowerCase();

  // Domínio antigo segue funcionando como hoje (zero quebra)
  if (host === LEGACY_HOST) {
    return { kind: 'legacy' };
  }

  // Comanda Tech: análise por subdomínio
  if (host === COMANDATECH_ROOT || host.endsWith(`.${COMANDATECH_ROOT}`)) {
    if (host === COMANDATECH_ROOT || host === `www.${COMANDATECH_ROOT}`) {
      return { kind: 'root-redirect' };
    }

    // Extrai o subdomínio (parte antes de .comandatech.com.br)
    const sub = host.slice(0, host.length - COMANDATECH_ROOT.length - 1).toLowerCase();

    // Subdomínios reservados → painel admin
    if (RESERVED_SUBDOMAINS.has(sub)) {
      return { kind: 'admin' };
    }

    // Qualquer outro subdomínio → loja
    return { kind: 'store', subdomain: sub };
  }

  // Qualquer outro host (localhost, lovable.app, vercel.app, etc.) → painel admin
  return { kind: 'admin' };
}
