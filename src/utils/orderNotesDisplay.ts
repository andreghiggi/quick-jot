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

/**
 * Extrai a forma de pagamento das `notes` de um pedido.
 *
 * O Pedido Express grava `Pagamento: ` (vazio) quando criado sem forma
 * definida (ex.: retirada cobrada depois). Quando o operador clica em
 * "Cobrar", o `OrderCardChargeDialog` apenas anexa
 * `[COBRADO] Pagamento: <forma>` ao final, sem limpar o vazio inicial.
 *
 * Esta função prefere o `Pagamento:` que vem depois de `[COBRADO]` e,
 * caso não exista, retorna a última ocorrência **não vazia** de
 * `Pagamento: <X>`. Mantém compatibilidade total com pedidos antigos.
 */
export function extractPaymentName(notes: string | null | undefined): string | null {
  if (!notes) return null;
  // 1) Preferir o pagamento gravado pelo fluxo de Cobrar ([COBRADO])
  const cobradoMatch = notes.match(/\[COBRADO\][^|]*?Pagamento:\s*([^|()\n]+)/i);
  const cobradoName = cobradoMatch?.[1]?.trim();
  if (cobradoName) return cobradoName;
  // 2) Caso contrário, última ocorrência não vazia de "Pagamento: X"
  const all = Array.from(notes.matchAll(/Pagamento:\s*([^|()\n]*)/gi))
    .map((m) => m[1]?.trim())
    .filter((v): v is string => !!v);
  return all.length > 0 ? all[all.length - 1] : null;
}
