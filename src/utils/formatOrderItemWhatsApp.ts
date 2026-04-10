/**
 * Formats an order item for WhatsApp messages, parsing grouped optionals
 * from the item name and displaying them on separate lines with bold group names.
 *
 * Input name format: "Açaí 700ml (Frutas: Abacaxi | Adicionais: Paçoca R$2.00, Leite R$3.00)"
 * Output:
 *   *1x Açaí 700ml* - R$ 35,00
 *   *Frutas:* Abacaxi
 *   *Adicionais:* Paçoca R$2,00, Leite R$3,00
 *   Observação: Gelado
 */
export function formatOrderItemWhatsApp(item: {
  name: string;
  quantity: number;
  price: number;
  notes?: string | null;
}): string {
  let displayName = item.name;
  const lines: string[] = [];

  // Parse grouped optionals from parentheses at the end of the name
  if (item.name.includes('(') && item.name.endsWith(')')) {
    const idx = item.name.indexOf('(');
    displayName = item.name.substring(0, idx).trim();
    const content = item.name.substring(idx + 1, item.name.length - 1).trim();

    if (content.includes(':')) {
      // New format: "GroupName: item1, item2 | GroupName2: item3"
      const groups = content.split('|').map(g => g.trim()).filter(Boolean);
      for (const groupStr of groups) {
        const colonIdx = groupStr.indexOf(':');
        if (colonIdx > -1) {
          const groupName = groupStr.substring(0, colonIdx).trim();
          const itemsStr = groupStr.substring(colonIdx + 1).trim();
          // Replace . decimal with , for Brazilian format
          lines.push(`  - _${groupName}:_ ${itemsStr.replace(/R\$(\d+)\.(\d{2})/g, 'R$$1,$2')}`);
        } else {
          lines.push(`  - ${groupStr.replace(/R\$(\d+)\.(\d{2})/g, 'R$$1,$2')}`);
        }
      }
    } else {
      // Legacy format: just items separated by commas
      lines.push(`  - _Adicionais:_ ${content.replace(/R\$(\d+)\.(\d{2})/g, 'R$$1,$2')}`);
    }
  }

  // Format price with Brazilian comma
  const totalPrice = (item.price * item.quantity).toFixed(2).replace('.', ',');

  // Build the formatted string
  let result = `*${item.quantity}x ${displayName}* - R$ ${totalPrice}`;
  if (lines.length > 0) {
    result += '\n' + lines.join('\n');
  }
  if (item.notes) {
    result += `\n  - _Observação:_ ${item.notes}`;
  }

  return result;
}
