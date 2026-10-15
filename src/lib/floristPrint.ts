// Layout de impressão exclusivo do perfil Floricultura (recibo e comanda de produção).
import { destinationKey, type FloristDestination } from './floristDestination';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

/** "Pronto até" da floricultura: data da entrega + primeira hora do turno. Ex.: "23/10 16h". */
export function floristReadyLabel(d?: FloristDestination | null): string | null {
  if (!d?.date) return null;
  const [, m, day] = d.date.split('-');
  if (!m || !day) return null;
  const h = (d.slot || '').match(/(\d{1,2})/);
  return h ? `${day}/${m} ${h[1].padStart(2, '0')}h` : `${day}/${m}`;
}

/** Menor "pronto até" entre os destinos (o mais cedo). */
export function earliestFloristReady(dests: (FloristDestination | null | undefined)[]): string | null {
  const sorted = dests
    .filter((d): d is FloristDestination => !!d?.date)
    .sort((a, b) => `${a.date}${a.slot || ''}`.localeCompare(`${b.date}${b.slot || ''}`));
  return sorted.length ? floristReadyLabel(sorted[0]) : null;
}

export interface FloristPrintItem {
  name: string;
  quantity: number;
  /** Preço unitário (já com adicionais). */
  price: number;
  groupedOptionals?: { groupName: string; items: string }[];
  notes?: string | null;
  destination?: FloristDestination | null;
}

/**
 * Taxa de entrega exibida por item: cobrada uma vez por destino (no primeiro item dele).
 */
export function floristItemFees(items: FloristPrintItem[]): number[] {
  const seen = new Set<string>();
  return items.map((it) => {
    const d = it.destination;
    if (!d || d.mode !== 'delivery') return 0;
    const k = destinationKey(d);
    if (seen.has(k)) return 0;
    seen.add(k);
    return Number(d.fee) || 0;
  });
}

/** Bloco completo por produto, na ordem pedida pela floricultura. */
export function renderFloristItemsHTML(items: FloristPrintItem[]): string {
  const fees = floristItemFees(items);
  return items
    .map((it, i) => {
      const d = it.destination;
      const out: string[] = [];
      if (d) {
        const modo = d.mode === 'delivery' ? '🛵 ENTREGA' : '🏪 RETIRADA NA LOJA';
        out.push(`<div class="fl-line fl-mode">${modo} - ${d.forWhom === 'gift' ? '🎁 PRESENTE' : 'PARA O COMPRADOR'}</div>`);
      }
      out.push(`<div class="fl-line fl-name">[${it.quantity}x] ${esc(it.name)}</div>`);
      for (const g of it.groupedOptionals || []) {
        g.items
          .split(/,(?!\s*\d{2}\s*(?:,|$))/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((a) => out.push(`<div class="fl-line">+ ${esc(a)}</div>`));
      }
      if (d?.date) {
        const date = d.date.split('-').reverse().join('/');
        out.push(`<div class="fl-line">Data: ${esc(date)} | Turno: ${esc(d.slot || '')}</div>`);
      }
      if (d?.mode === 'delivery') {
        let addr = `${(d.street || '').trim()}, ${(d.number || '').trim()}`;
        if ((d.complement || '').trim()) addr += ` - ${d.complement!.trim()}`;
        addr += ` - ${(d.neighborhood || '').trim()}`;
        if ((d.reference || '').trim()) addr += ` | Ref: ${d.reference!.trim()}`;
        out.push(`<div class="fl-line">[ENDERECO]${esc(addr)}[/ENDERECO]</div>`);
      }
      if ((d?.recipientName || '').trim()) out.push(`<div class="fl-line">Recebe: ${esc(d!.recipientName!.trim())}</div>`);
      if ((d?.recipientPhone || '').trim()) out.push(`<div class="fl-line">Telefone: ${esc(d!.recipientPhone!.trim())}</div>`);
      const msg = (d?.cardMessage || '').trim();
      if (d?.forWhom === 'gift' && msg) {
        out.push(`<div class="fl-line">Mensagem do cartão (escrever à mão):</div><div class="fl-line">[OBS]${esc(msg)}[/OBS]</div>`);
      }
      const notes = (it.notes || '').trim();
      if (notes) out.push(`<div class="fl-line">[OBS]Obs: ${esc(notes)}[/OBS]</div>`);
      const prod = it.price * it.quantity;
      out.push(`<div class="fl-line">Valor do produto: ${money(prod)}</div>`);
      out.push(`<div class="fl-line">Valor da entrega: ${money(fees[i])}</div>`);
      out.push(`<div class="fl-line fl-total">Total: ${money(prod + fees[i])}</div>`);
      const sep = i < items.length - 1 ? '<div class="fl-sep">--------------------------------</div>' : '';
      return `<div class="fl-item">${out.join('')}</div>${sep}`;
    })
    .join('');
}

export const FLORIST_PRINT_CSS = `
.fl-item { margin: 1.5mm 0; }
.fl-line { font-size: 10pt; font-weight: bold; margin: 0.4mm 0; }
.fl-mode { text-align: center; border: 1px solid #000; padding: 0.8mm; }
.fl-name { font-size: 11pt; text-transform: uppercase; }
.fl-total { font-size: 11pt; }
.fl-sep { font-size: 10pt; line-height: 1; margin: 1mm 0; }
`;
