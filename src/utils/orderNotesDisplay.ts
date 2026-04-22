/**
 * Separa o campo `notes` de um item de pedido em dois pedaços distintos:
 *  - `description`: conteúdo entre `[DESC]...[/DESC]`, injetado pelo
 *    auto_printer a partir da descrição cadastrada do produto. Deve ser
 *    exibido como "Descrição" (rótulo separado) na UI.
 *  - `observation`: o que o cliente realmente digitou como observação,
 *    sem os marcadores e sem o texto da descrição.
 */
export function parseItemNotes(notes: string | null | undefined): {
  description: string;
  observation: string;
} {
  if (!notes) return { description: '', observation: '' };

  const descriptions: string[] = [];
  // Captura todos os blocos [DESC]...[/DESC]
  const withoutDesc = notes.replace(/\[DESC\]([\s\S]*?)\[\/DESC\]/gi, (_m, inner) => {
    descriptions.push(String(inner).trim());
    return '';
  });

  // Limpa separadores soltos que sobraram após remover o bloco [DESC]
  const observation = withoutDesc
    .replace(/\s*\|\s*\|\s*/g, ' | ')
    .replace(/^\s*\|\s*/, '')
    .replace(/\s*\|\s*$/, '')
    .trim();

  return {
    description: descriptions.join(' | ').trim(),
    observation,
  };
}

/**
 * Compat: remove apenas os marcadores `[DESC]` / `[/DESC]`, mantendo o
 * conteúdo. Mantida para usos onde queremos um texto único (ex.: impressão
 * pelo navegador na função handlePrint do OrderCard).
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
