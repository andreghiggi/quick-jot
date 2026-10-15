// Destino por item do catálogo de floricultura (presente / para mim, retirada / entrega).
// Usado SOMENTE quando o perfil floricultura está ativo na loja.
import { GIFT_CARD_MAX_CHARS, normalizePhone } from './floristGift';

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
  cardMessage?: string;
  /** Taxa de entrega deste destino (calculada ao adicionar). */
  fee?: number;
}

export function validateDestination(d: Partial<FloristDestination> | null | undefined, today: string): string[] {
  const e: string[] = [];
  if (!d?.forWhom) return ['Escolha se é para presente ou para você'];
  if (!d.mode) return ['Escolha retirada na loja ou entrega'];
  if (d.forWhom === 'gift') {
    const msg = (d.cardMessage || '').trim();
    if (!msg) e.push('Escreva a mensagem do cartão');
    else if (msg.length > GIFT_CARD_MAX_CHARS) e.push(`Mensagem do cartão: máximo ${GIFT_CARD_MAX_CHARS} letras`);
  }
  if (d.mode === 'delivery') {
    if (!d.date) e.push('Escolha a data da entrega');
    else if (d.date < today) e.push('A data da entrega não pode ser no passado');
    if (!d.slot) e.push('Escolha o turno da entrega');
    if (d.forWhom === 'gift') {
      if ((d.recipientName || '').trim().length < 2) e.push('Informe o nome de quem recebe');
      const p = normalizePhone(d.recipientPhone);
      if (p.length < 10 || p.length > 11) e.push('Informe o WhatsApp de quem recebe');
    }
    if (!(d.street || '').trim()) e.push('Informe a rua');
    if (!(d.number || '').trim()) e.push('Informe o número');
    if (!(d.neighborhood || '').trim()) e.push('Informe o bairro');
    if (!(d.reference || '').trim()) e.push('Informe o ponto de referência');
  }
  return e;
}

const norm = (s?: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Chave do local: itens com a mesma chave saem juntos (mesma comanda / mesma taxa). */
export function destinationKey(d?: FloristDestination | null): string {
  if (!d) return 'none';
  if (d.mode === 'pickup') return `pickup|${d.forWhom}|${norm(d.recipientName)}`;
  return [
    'delivery', norm(d.street), norm(d.number), norm(d.complement), norm(d.neighborhood),
    d.date || '', d.slot || '', norm(d.recipientName),
  ].join('|');
}

/** Soma uma taxa por endereço de entrega distinto. */
export function totalDeliveryFee(dests: (FloristDestination | undefined)[]): number {
  const seen = new Map<string, number>();
  for (const d of dests) {
    if (!d || d.mode !== 'delivery') continue;
    const k = destinationKey(d);
    if (!seen.has(k)) seen.set(k, d.fee || 0);
  }
  let sum = 0;
  seen.forEach((v) => { sum += v; });
  return sum;
}

export function formatAddress(d: FloristDestination): string {
  let s = `${(d.street || '').trim()}, ${(d.number || '').trim()}`;
  if ((d.complement || '').trim()) s += ` - ${d.complement!.trim()}`;
  s += ` - ${(d.neighborhood || '').trim()}`;
  if ((d.reference || '').trim()) s += ` | Ref: ${d.reference!.trim()}`;
  return s;
}

export function describeDestination(d: FloristDestination): string {
  const parts: string[] = [];
  parts.push(d.forWhom === 'gift' ? 'PRESENTE' : 'Para o comprador');
  if (d.mode === 'pickup') parts.push('Retirada na loja');
  else {
    parts.push(`Entrega ${d.date!.split('-').reverse().join('/')} ${d.slot}`);
    if (d.forWhom === 'gift') parts.push(`Recebe: ${d.recipientName!.trim()} (${normalizePhone(d.recipientPhone)})`);
    parts.push(`Endereço: ${formatAddress(d)}`);
  }
  if (d.forWhom === 'gift' && (d.cardMessage || '').trim()) parts.push(`Cartão: "${d.cardMessage!.trim()}"`);
  return parts.join(' | ');
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
