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
