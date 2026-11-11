const FIELD_LABELS: Array<[RegExp, string]> = [
  [/ncm/i, 'NCM (8 dígitos)'], [/cfop/i, 'CFOP'], [/csosn/i, 'CSOSN'], [/cest/i, 'CEST'],
  [/codigo_municipio|cmun|ibge/i, 'Código IBGE da cidade (redigite o CEP)'],
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
  : typeof v === 'string' ? v : v && typeof v === 'object' ? String((v as any).message || (v as any).mensagem || (v as any).msg || '') : '';

/** Lists every field-level validation error returned by the fiscal service. */
export function nfeFieldErrors(value: unknown, depth = 0): string[] {
  if (!value || typeof value !== 'object' || depth > 5) return [];
  const v = value as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ['errors', 'erros', 'detalhes', 'details', 'fields', 'issues', 'validation_errors']) {
    const e = v[key];
    if (Array.isArray(e)) {
      for (const it of e) {
        if (typeof it === 'string') out.push(it);
        else if (it && typeof it === 'object') {
          const o = it as any;
          const path = o.campo || o.field || o.path || o.property || (Array.isArray(o.loc) ? o.loc.join('.') : '');
          const msg = asText(o.message || o.mensagem || o.msg || o.erro || o.error);
          const p = Array.isArray(path) ? path.join('.') : String(path || '');
          if (p || msg) out.push(p ? `${nfeFieldLabel(p)}${msg ? ` — ${msg}` : ''}` : msg);
        }
      }
    } else if (e && typeof e === 'object') {
      for (const [p, msg] of Object.entries(e)) out.push(`${nfeFieldLabel(p)}${asText(msg) ? ` — ${asText(msg)}` : ''}`);
    }
  }
  if (!out.length) for (const key of ['result', 'data', 'response']) out.push(...nfeFieldErrors(v[key], depth + 1));
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
