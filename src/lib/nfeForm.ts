// Regras puras do formulário de NF-e (modelo 55). Valores sempre em centavos
// para comparar totais sem erro de ponto flutuante.

export const NFE_TEXT_LIMITS = { xPed: 30, infCpl: 2000, infAdFisco: 2000 } as const;

export const NFE_PAYMENT_TYPES = [
  { code: '01', label: 'Dinheiro' },
  { code: '03', label: 'Cartão de Crédito' },
  { code: '04', label: 'Cartão de Débito' },
  { code: '15', label: 'Boleto Bancário' },
  { code: '17', label: 'PIX' },
  { code: '05', label: 'Crediário / Duplicata' },
  { code: '90', label: 'Sem Pagamento' },
  { code: '99', label: 'Outros' },
] as const;

export const NFE_FREIGHT_MODES = [
  { code: '0', label: '0 — Por conta do emitente (CIF)' },
  { code: '1', label: '1 — Por conta do destinatário (FOB)' },
  { code: '2', label: '2 — Por conta de terceiros' },
  { code: '3', label: '3 — Próprio por conta do remetente' },
  { code: '4', label: '4 — Próprio por conta do destinatário' },
  { code: '9', label: '9 — Sem transporte' },
] as const;

export const NFE_PRESENCE = [
  { code: '0', label: '0 — Não se aplica' },
  { code: '1', label: '1 — Presencial' },
  { code: '2', label: '2 — Não presencial, internet' },
  { code: '3', label: '3 — Não presencial, teleatendimento' },
  { code: '4', label: '4 — Entrega a domicílio' },
  { code: '9', label: '9 — Não presencial, outros' },
] as const;

export type NFePayment = { tipo: string; valor: number };
export type NFeInstallment = { numero: string; vencimento: string; valor: number };

export const toCents = (v: number) => Math.round((Number(v) || 0) * 100);

/** Modelo 55: pagamentos fecham o total, sem troco. */
export function paymentDifferenceCents(total: number, payments: NFePayment[]): number {
  if (payments.some(p => p.tipo === '90')) return 0;
  const paid = payments.reduce((s, p) => s + toCents(p.valor), 0);
  return toCents(total) - paid;
}

/** Uma única forma acompanha o total; divisões manuais permanecem preservadas. */
export function syncSinglePayment(total: number, payments: NFePayment[]): NFePayment[] {
  if (payments.length !== 1) return payments;
  const p = payments[0];
  const valor = p.tipo === '90' ? 0 : toCents(total) / 100;
  return p.valor === valor ? payments : [{ ...p, valor }];
}

export function selectPaymentType(total: number, payments: NFePayment[], index: number, tipo: string): NFePayment[] {
  if (tipo === '90') return [{ tipo, valor: 0 }];
  const otherCents = payments.reduce((s, p, i) => i === index ? s : s + toCents(p.valor), 0);
  return payments.map((p, i) => i === index
    ? { tipo, valor: payments.length === 1 ? toCents(total) / 100 : (p.valor || Math.max(0, toCents(total) - otherCents) / 100) }
    : p);
}

export function appendPayment(total: number, payments: NFePayment[]): NFePayment[] {
  const current = payments.filter(p => p.tipo !== '90');
  return [...current, { tipo: '01', valor: Math.max(0, paymentDifferenceCents(total, current)) / 100 }];
}

/**
 * Gera parcelas a partir de prazos em dias (ex.: "30/60/90"). O resto dos
 * centavos fica na última parcela para que a soma feche exatamente o total.
 */
export function buildInstallments(total: number, terms: string, baseDate: Date): NFeInstallment[] {
  const days = terms.split(/[\/,;\s]+/).map(t => parseInt(t, 10)).filter(n => Number.isFinite(n) && n >= 0);
  if (days.length === 0 || toCents(total) <= 0) return [];
  const totalCents = toCents(total);
  const each = Math.floor(totalCents / days.length);
  return days.map((d, i) => {
    const due = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + d);
    const cents = i === days.length - 1 ? totalCents - each * (days.length - 1) : each;
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      numero: String(i + 1).padStart(3, '0'),
      vencimento: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`,
      valor: cents / 100,
    };
  });
}

/** Chave de acesso de documento referenciado: exatamente 44 dígitos. */
export function validAccessKey(key: string): boolean {
  return /^\d{44}$/.test(key.replace(/\D/g, '')) && key.replace(/\D/g, '').length === key.replace(/\s/g, '').length;
}

/** CPF (11) ou CNPJ (14) só com dígitos, para autXML e transportadora. */
export function validTaxDocument(doc: string): boolean {
  const d = doc.replace(/\D/g, '');
  return d.length === 11 || d.length === 14;
}
