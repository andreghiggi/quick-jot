/** Dígito verificador EAN-8 para os 7 primeiros dígitos. */
export function ean8CheckDigit(first7: string): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(first7[i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan8(code: string): boolean {
  return /^\d{8}$/.test(code) && ean8CheckDigit(code.slice(0, 7)) === Number(code[7]);
}

/**
 * Converte o que foi lido/digitado em número de comanda.
 * - 8 dígitos com verificador EAN-8 válido → 7 primeiros sem zeros à esquerda.
 * - Qualquer outro número → sem zeros à esquerda ("026" = "26" = "0000026").
 * Retorna null se inválido.
 */
export function parseComandaCode(raw: string): number | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  let n: number;
  if (digits.length === 8 && isValidEan8(digits)) n = Number(digits.slice(0, 7));
  else if (digits.length <= 7) n = Number(digits);
  else return null;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatComandaNumber(n: number | null | undefined): string {
  if (n == null) return '';
  return String(n).padStart(3, '0');
}
