// Shared persisted destination reader; do not change the legacy notes format.
export interface FloristDestination {
  forWhom: 'gift' | 'self';
  mode: 'pickup' | 'delivery';
  date?: string; // YYYY-MM-DD
  slot?: string;
  recipientName?: string;
  recipientPhone?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  reference?: string;
  city?: string;
  state?: string;
  addressLabel?: string;
  savedAddressId?: string;
  cardMessage?: string;
  /** Taxa de entrega deste destino (calculada ao adicionar). */
  fee?: number;
}

/**
 * Lê de volta o destino gravado no texto do item (formato de describeDestination).
 * Retorna o destino e as observações livres que sobram (sem o bloco DESTINO e sem [DESC]).
 */
export function parseDestinationFromNotes(notes?: string | null): { destination: FloristDestination | null; rest: string } {
  const raw = (notes || '').replace(/\[DESC\][\s\S]*?\[\/DESC\]/g, '').trim();
  const m = raw.match(/DESTINO\s*\d+\s*:\s*/i);
  if (!m || m.index === undefined) return { destination: null, rest: raw.replace(/\s*\|\s*$/, '').trim() };
  const before = raw.slice(0, m.index).replace(/\s*\|\s*$/, '').trim();
  const body = raw.slice(m.index + m[0].length);
  const d: FloristDestination = { forWhom: 'self', mode: 'pickup' };
  const cardM = body.match(/Cart[aã]o:\s*"([\s\S]*)"/i);
  if (cardM) d.cardMessage = cardM[1].trim();
  const noCard = cardM ? body.slice(0, cardM.index) : body;
  const parts = noCard.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^presente$/i.test(p)) d.forWhom = 'gift';
    else if (/^retirada/i.test(p)) d.mode = 'pickup';
    else if (/^entrega\s/i.test(p)) {
      d.mode = 'delivery';
      const em = p.match(/^entrega\s+(\d{2})\/(\d{2})\/(\d{4})\s*(.*)$/i);
      if (em) { d.date = `${em[3]}-${em[2]}-${em[1]}`; d.slot = em[4].trim(); }
    } else if (/^recebe:/i.test(p)) {
      const rm = p.match(/^recebe:\s*(.*?)\s*(?:\(([^)]*)\))?$/i);
      if (rm) { d.recipientName = rm[1].trim(); if (rm[2]) d.recipientPhone = rm[2].trim(); }
    } else if (/^endere[cç]o:/i.test(p)) {
      const addr = p.replace(/^endere[cç]o:\s*/i, '');
      const [streetPart, ...restAddr] = addr.split(/\s+-\s+/);
      const [street, number] = streetPart.split(/,\s*/);
      d.street = (street || '').trim();
      d.number = (number || '').trim();
      if (restAddr.length >= 2) { d.complement = restAddr.slice(0, -1).join(' - ').trim(); d.neighborhood = restAddr[restAddr.length - 1].trim(); }
      else d.neighborhood = (restAddr[0] || '').trim();
      if (/^ref:/i.test(parts[i + 1] || '')) { d.reference = parts[i + 1].replace(/^ref:\s*/i, '').trim(); i++; }
    }
  }
  return { destination: d, rest: before };
}
