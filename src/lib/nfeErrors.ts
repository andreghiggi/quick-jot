const FIELD_LABELS: Array<[RegExp, string]> = [
  [/ncm/i, 'NCM (8 dígitos)'], [/cfop/i, 'CFOP'], [/csosn/i, 'CSOSN'], [/cest/i, 'CEST'],
  [/codigo_municipio|cmun|ibge/i, 'Cidade identificada pelo CEP (confira o CEP)'],
  [/municipio|cidade/i, 'Cidade'], [/\buf\b|estado/i, 'UF'], [/cep/i, 'CEP'],
  [/logradouro/i, 'Logradouro'], [/numero/i, 'Número'], [/bairro/i, 'Bairro'],
  [/cnpj/i, 'CNPJ'], [/cpf/i, 'CPF'], [/inscricao_estadual|\bie\b/i, 'Inscrição estadual'],
  [/razao_social|nome/i, 'Nome / Razão social'], [/pagamento|detpag/i, 'Pagamentos'],
  [/quantidade/i, 'Quantidade'], [/valor_unitario/i, 'Valor unitário'], [/descricao/i, 'Descrição'],
];

/** Converts a technical field path (e.g. itens.0.ncm) into a user-facing label. */
export function nfeFieldLabel(path: string): string {
  const item = path.match(/itens?[.[](\d+)/i);
  const where = item ? `Item ${Number(item[1]) + 1}` : /destinatario|dest\b/i.test(path) ? 'Destinatário'
    : /transport/i.test(path) ? 'Transporte' : /pagamento/i.test(path) ? 'Pagamentos' : '';
  const leaf = path.split(/[.[\]]/).filter(Boolean).pop() || path;
  const label = FIELD_LABELS.find(([re]) => re.test(leaf))?.[1] || leaf;
  return where && where !== label ? `${where}: ${label}` : label;
}

const asText = (v: unknown): string => Array.isArray(v) ? v.map(asText).filter(Boolean).join(', ')
  : typeof v === 'string' ? v : v && typeof v === 'object' ? asText((v as Record<string, unknown>).message || (v as Record<string, unknown>).mensagem || (v as Record<string, unknown>).msg) : '';

function collectFields(value: unknown, path = '', depth = 0): string[] {
  if (!value || depth > 10) return [];
  if (typeof value === 'string') return [path ? `${nfeFieldLabel(path)} — ${value}` : value];
  if (Array.isArray(value)) return value.flatMap((entry, index) => collectFields(entry,
    typeof entry === 'object' && path ? `${path}.${index}` : path, depth + 1));
  if (typeof value !== 'object') return [];
  const v = value as Record<string, unknown>;
  const explicitPath = v.campo || v.field || v.path || v.property || v.loc;
  const field = Array.isArray(explicitPath) ? explicitPath.join('.') : typeof explicitPath === 'string' ? explicitPath : path;
  const msg = asText(v.message || v.mensagem || v.msg || v.erro || v.error || v.reason);
  if (msg) return [field ? `${nfeFieldLabel(field)} — ${msg}` : msg];
  return Object.entries(v).filter(([key]) => !['request_payload', 'payload', 'headers', 'token', 'stack'].includes(key))
    .flatMap(([key, entry]) => collectFields(entry, path ? `${path}.${key}` : key, depth + 1));
}

/** Lists every field-level validation error returned by the fiscal service. */
export function nfeFieldErrors(value: unknown, depth = 0): string[] {
  if (typeof value === 'string' && depth <= 10) {
    try { return nfeFieldErrors(JSON.parse(value), depth + 1); } catch { return []; }
  }
  if (!value || typeof value !== 'object' || depth > 10) return [];
  if (Array.isArray(value)) return value.flatMap(v => nfeFieldErrors(v, depth + 1));
  const v = value as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ['errors', 'erros', 'detalhes', 'details', 'fields', 'issues', 'validation_errors']) {
    const e = v[key];
    out.push(...collectFields(e));
  }
  for (const key of ['result', 'data', 'response', 'error', 'validation', 'cause']) out.push(...nfeFieldErrors(v[key], depth + 1));
  return [...new Set(out)];
}

function baseMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return typeof value === 'string' && value.trim() ? value : null;
  const v = value as Record<string, unknown>;
  for (const key of ['xMotivo', 'motivo_rejeicao', 'motivo', 'message', 'error', 'mensagem', 'result', 'data']) {
    const msg = baseMessage(v[key]);
    if (msg) return msg;
  }
  return null;
}

/** Extract only the fiscal message plus field errors; never serialize payloads or credentials. */
export function nfeFailureMessage(value: unknown): string | null {
  const fields = nfeFieldErrors(value);
  const base = baseMessage(value);
  if (fields.length) return `${base ? `${base}. ` : ''}Corrija: ${fields.join('; ')}`;
  return base;
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
