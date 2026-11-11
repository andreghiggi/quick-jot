/** Extract only the fiscal message, never serialize payloads or credentials. */
export function nfeFailureMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return typeof value === 'string' && value.trim() ? value : null;
  const v = value as Record<string, unknown>;
  for (const key of ['xMotivo', 'motivo_rejeicao', 'motivo', 'message', 'error', 'errors', 'mensagem', 'result', 'data']) {
    const nested = v[key];
    const msg = Array.isArray(nested)
      ? nested.map(nfeFailureMessage).filter(Boolean).join('; ')
      : nfeFailureMessage(nested);
    if (msg) return msg;
  }
  return null;
}

export async function readNfeInvokeError(error: unknown): Promise<string> {
  const e = error as { context?: Response; message?: string } | null;
  if (e?.context && typeof e.context.clone === 'function') {
    try {
      const msg = nfeFailureMessage(await e.context.clone().json());
      if (msg) return msg;
    } catch { /* Non-JSON response: use a safe user-facing fallback. */ }
  }
  return e?.message === 'Edge Function returned a non-2xx status code'
    ? 'Não foi possível transmitir a NF-e. O serviço fiscal não retornou um motivo detalhado.'
    : e?.message || 'Erro ao transmitir NF-e.';
}