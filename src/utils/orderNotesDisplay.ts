/**
 * Remove os marcadores `[DESC]...[/DESC]` usados pelo auto_printer
 * para imprimir a descrição do produto na comanda. Esses marcadores
 * NÃO devem ser exibidos na UI (cards, diálogos, recibo do cliente).
 *
 * O conteúdo dentro do marcador é preservado em texto plano,
 * separado da observação por um " | " quando ambos existirem.
 *
 * Ex.: "Sem ketchup | [DESC]3 Hambúrgueres[/DESC]"
 *   -> "Sem ketchup | 3 Hambúrgueres"
 */
export function stripDescMarkers(notes: string | null | undefined): string {
  if (!notes) return '';
  return notes
    .replace(/\[\/?DESC\]/gi, '')
    .replace(/\s*\|\s*\|\s*/g, ' | ')
    .replace(/^\s*\|\s*/, '')
    .replace(/\s*\|\s*$/, '')
    .trim();
}
