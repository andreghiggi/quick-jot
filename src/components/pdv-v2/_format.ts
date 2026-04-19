/** Formata número como moeda BRL com prefixo "R$". */
export function brl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}
