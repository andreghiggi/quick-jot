/** Fiscal policy isolated from the homologated payment engine. */
export type FrenteCaixaFiscalMode = 'fiscal' | 'nao_fiscal';

interface FiscalPaymentLine {
  amount: number;
  integration?: string | null;
  tef?: unknown;
}

export function requiresFrenteCaixaNfce(lines: readonly FiscalPaymentLine[]): boolean {
  return lines.some((line) =>
    Number.isFinite(line.amount) && line.amount > 0 && (
      line.integration === 'tef_pinpad' ||
      line.integration === 'tef_smartpos' ||
      !!line.tef
    ),
  );
}

export function resolveFrenteCaixaFiscalMode(
  requested: FrenteCaixaFiscalMode,
  lines: readonly FiscalPaymentLine[],
): FrenteCaixaFiscalMode {
  return requiresFrenteCaixaNfce(lines) ? 'fiscal' : requested;
}