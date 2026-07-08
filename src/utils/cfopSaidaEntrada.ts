/**
 * Converte um CFOP de saída (fornecedor emissor) para o CFOP de entrada
 * equivalente na nossa loja. Regra padrão: prefixo 5→1, 6→2, 7→3.
 * Mantém os 3 últimos dígitos.
 */
export function cfopSaidaParaEntrada(cfop: string | null | undefined): string | null {
  if (!cfop) return null;
  const c = String(cfop).replace(/\D/g, '');
  if (c.length !== 4) return cfop || null;
  const map: Record<string, string> = { '5': '1', '6': '2', '7': '3' };
  const first = c[0];
  if (!map[first]) return c;
  return map[first] + c.slice(1);
}