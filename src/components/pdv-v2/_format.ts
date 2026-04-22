/** Formata número como moeda BRL com prefixo "R$". */
export function brl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/** ID da Lancheria da I9 — utilizado para rollouts isolados de novas funcionalidades. */
export const LANCHERIA_I9_COMPANY_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Máscara de moeda em tempo real: trata a entrada como centavos.
 * Ex.: "128" -> "R$ 1,28"; "12800" -> "R$ 128,00".
 * Retorna string vazia quando não houver dígitos.
 */
export function maskCurrencyInput(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  // Limita a 11 dígitos (até R$ 999.999.999,99) para evitar overflow visual.
  const safe = digits.slice(0, 11);
  const cents = parseInt(safe, 10);
  return brlFormatter.format(cents / 100);
}

/** Converte string mascarada (ou solta) em number. */
export function parseCurrencyInput(masked: string): number {
  const digits = (masked || '').replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}
