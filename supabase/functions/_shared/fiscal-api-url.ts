/** Resolves Fiscal Flow API URLs with safe fallback after VPS cutover. */
const EMIT_NFCE = 'https://emit.agilizeerp.com.br/functions/v1/nfce-api'
const EMIT_NFE = 'https://emit.agilizeerp.com.br/functions/v1/nfe-api'

const LEGACY_HOSTS = [
  'vdzkhealunurfgrujekg.supabase.co',
  'api.agilizeerp.com.br',
]

function normalizeBase(url: string): string {
  return url.replace(/\/emitir\/?$/i, '').replace(/\/+$/, '')
}

function isLegacyFiscalUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return LEGACY_HOSTS.some((host) => lower.includes(host))
}

export function resolveNfceApiUrl(raw?: string | null): string {
  const env = (raw ?? Deno.env.get('NFCE_API_URL') ?? '').trim()
  if (!env || isLegacyFiscalUrl(env)) return EMIT_NFCE
  return normalizeBase(env)
}

export function resolveNfeApiUrl(nfeRaw?: string | null, nfceRaw?: string | null): string {
  const nfe = (nfeRaw ?? Deno.env.get('NFE_API_URL') ?? '').trim()
  if (nfe && !isLegacyFiscalUrl(nfe)) return normalizeBase(nfe)

  const nfce = resolveNfceApiUrl(nfceRaw)
  if (nfce.includes('/nfce-api')) return nfce.replace('/nfce-api', '/nfe-api')
  if (nfce.includes('/nfce')) return nfce.replace('/nfce', '/nfe')
  return EMIT_NFE
}

export function fiscalFlowBaseFromNfceUrl(nfceApiUrl: string): string {
  return nfceApiUrl.replace(/\/nfce-api(?:\/emitir)?$/i, '').replace(/\/emitir$/i, '').replace(/\/+$/, '')
}

export function resolveDfeApiUrl(raw?: string | null): string {
  const env = (raw ?? Deno.env.get('DFE_API_URL') ?? Deno.env.get('NFCE_API_URL') ?? '').trim()
  if (!env || isLegacyFiscalUrl(env)) return 'https://emit.agilizeerp.com.br/functions/v1/dfe-api'
  if (env.includes('/dfe-api')) return normalizeBase(env)
  if (env.includes('/nfce-api')) return env.replace('/nfce-api', '/dfe-api').replace(/\/+$/, '')
  return normalizeBase(env) + '/dfe-api'
}
