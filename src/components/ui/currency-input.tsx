import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Campo monetário "decimal livre" no padrão pt-BR.
 *
 * Comportamento:
 * - Durante a digitação aceita dígitos, '.' e ','. Não força máscara.
 * - Ao perder o foco (ou via {@link formatNow}) normaliza para "X,YY"
 *   (duas casas decimais, vírgula como separador).
 * - Campos vazios permanecem vazios (sem forçar "0,00") salvo se
 *   `formatEmptyAsZero` estiver ligado.
 *
 * O valor é exposto como `number` via `onValueChange`. A representação
 * de texto é local — o componente sincroniza o texto quando `value`
 * muda externamente E o campo não está em edição.
 */

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | string | null | undefined;
  onValueChange: (value: number, text: string) => void;
  /** Renderiza vazio como "0,00" no blur. */
  formatEmptyAsZero?: boolean;
}

function toDisplay(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2).replace('.', ',');
}

/** Aceita "1.234,56", "1234.56", "1234,56", "1,5". Retorna NaN para inválido. */
export function parseDecimalLivre(raw: string): number {
  if (!raw) return NaN;
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');
  let normalized = trimmed;
  if (hasComma && hasDot) {
    // Padrão pt-BR completo: pontos são milhar, vírgula é decimal.
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = trimmed.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, onBlur, onFocus, formatEmptyAsZero, className, inputMode, ...rest }, ref) => {
    const [text, setText] = React.useState<string>(() => toDisplay(value));
    const focusedRef = React.useRef(false);

    // Sincroniza com value externo quando o usuário não está editando.
    React.useEffect(() => {
      if (!focusedRef.current) {
        const next = toDisplay(value);
        setText((cur) => (cur === next ? cur : next));
      }
    }, [value]);

    return (
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode={inputMode ?? 'decimal'}
        value={text}
        className={cn(className)}
        onFocus={(e) => {
          focusedRef.current = true;
          onFocus?.(e);
        }}
        onChange={(e) => {
          // Permite apenas dígitos, '.', ',' e '-' inicial opcional.
          const cleaned = e.target.value.replace(/[^\d.,-]/g, '');
          setText(cleaned);
          const parsed = parseDecimalLivre(cleaned);
          onValueChange(Number.isFinite(parsed) ? parsed : 0, cleaned);
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          const parsed = parseDecimalLivre(text);
          if (!Number.isFinite(parsed)) {
            const fallback = formatEmptyAsZero ? '0,00' : '';
            setText(fallback);
            onValueChange(0, fallback);
          } else {
            const formatted = parsed.toFixed(2).replace('.', ',');
            setText(formatted);
            onValueChange(parsed, formatted);
          }
          onBlur?.(e);
        }}
      />
    );
  }
);
CurrencyInput.displayName = 'CurrencyInput';