/**
 * Calcula o offset (em minutos) usado em "Pronto até" da comanda de produção.
 *
 * Regra: o ticket exibe `criação + offset`, onde `offset = máximo do prazo − 10 min`.
 * O texto vem do campo "Prazo estimado de entrega" (`estimated_wait_time`)
 * em Configurações → WhatsApp. Aceita formatos livres:
 *   - "20 a 40 min"  → max=40 → offset=30
 *   - "30-45 minutos" → max=45 → offset=35
 *   - "40 min"       → max=40 → offset=30
 *   - "1h"           → max=60 → offset=50
 *
 * Se não for possível parsear, retorna `fallback` (default 30).
 */
export function computeReadyOffsetMinutes(
  estimatedWaitTime: string | undefined | null,
  fallback = 30
): number {
  if (!estimatedWaitTime) return fallback;

  const text = estimatedWaitTime.toLowerCase();

  // Captura todos os números (inteiros ou decimais) na string
  const numbers = Array.from(text.matchAll(/\d+(?:[.,]\d+)?/g))
    .map((m) => parseFloat(m[0].replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (numbers.length === 0) return fallback;

  let max = Math.max(...numbers);

  // Heurística: se a string menciona "h" / "hora" e o maior número é pequeno,
  // converte para minutos (ex.: "1h" → 60, "1h30" → trata o 30 como min separado)
  const mentionsHours = /\bh(?:ora)?s?\b|\bh\d|\dh/.test(text);
  if (mentionsHours && max <= 12) {
    max = max * 60;
  }

  const offset = Math.round(max - 10);
  return offset > 0 ? offset : fallback;
}