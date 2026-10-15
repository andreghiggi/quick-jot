// Layout de impressão exclusivo do perfil Floricultura (recibo e comanda de produção).
import { destinationKey, parseDestinationFromNotes, type FloristDestination } from './floristDestination';

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

/**
 * Bloco completo por produto, na ordem pedida pela floricultura.
 * Usa as mesmas classes que o programa de impressão automática já entende
 * (item / item-name / qty / name / description / add-line / obs-text / item-notes),
 * para sair igual no navegador, na fila automática e na reimpressão.
 */
export function renderFloristItemsHTML(items: FloristPrintItem[]): string {
  const fees = floristItemFees(items);
  const line = (txt: string, extra = '') => `<div class="fl-line description add-line${extra ? ' ' + extra : ''}">${txt}</div>`;
  return items
    .map((it, i) => {
      const d = it.destination;
      const out: string[] = [];
      if (d) {
        const modo = d.mode === 'delivery' ? '🛵 ENTREGA' : '🏪 RETIRADA NA LOJA';
        out.push(line(`${modo} - ${d.forWhom === 'gift' ? '🎁 PRESENTE' : 'PARA O COMPRADOR'}`, 'fl-mode'));
      }
      out.push(`<div class="fl-line fl-name item-name"><span class="qty">[${it.quantity}x]</span> <span class="name">${esc(it.name)}</span></div>`);
      for (const g of it.groupedOptionals || []) {
        g.items
          .split(/,(?!\s*\d{2}\s*(?:,|$))/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((a) => out.push(line(`+ ${esc(a)}`)));
      }
      if (d?.date) {
        const date = d.date.split('-').reverse().join('/');
        out.push(line(`Data: ${esc(date)} | Turno: ${esc(d.slot || '')}`));
      }
      if (d?.mode === 'delivery') {
        let addr = `${(d.street || '').trim()}, ${(d.number || '').trim()}`;
        if ((d.complement || '').trim()) addr += ` - ${d.complement!.trim()}`;
        addr += ` - ${(d.neighborhood || '').trim()}`;
        if ((d.reference || '').trim()) addr += ` | Ref: ${d.reference!.trim()}`;
        out.push(line(`Endereço: ${esc(addr)}`));
      }
      if ((d?.recipientName || '').trim()) out.push(line(`Recebe: ${esc(d!.recipientName!.trim())}`));
      if ((d?.recipientPhone || '').trim()) out.push(line(`Telefone: ${esc(d!.recipientPhone!.trim())}`));
      const msg = (d?.cardMessage || '').trim();
      if (d?.forWhom === 'gift' && msg) {
        out.push(line('Cartão (escrever à mão):'));
        out.push(`<div class="fl-line fl-card obs-text item-notes">[OBS]${esc(msg)}[/OBS]</div>`);
      }
      // Observação livre do cliente (nunca o texto técnico do destino).
      const notes = parseDestinationFromNotes(it.notes).rest;
      if (notes) out.push(`<div class="fl-line obs-text item-notes">[OBS]Obs: ${esc(notes)}[/OBS]</div>`);
      const prod = it.price * it.quantity;
      out.push(line(`Valor do produto: ${money(prod)}`));
      out.push(line(`Valor da entrega: ${money(fees[i])}`));
      out.push(line(`Total: ${money(prod + fees[i])}`, 'fl-total'));
      const sep = i < items.length - 1 ? '<div class="fl-sep">--------------------------------</div>' : '';
      return `<div class="item fl-item">${out.join('')}</div>${sep}`;
    })
    .join('');
}

export const FLORIST_PRINT_CSS = `
.fl-item { margin: 1.5mm 0; }
.fl-item .fl-line { font-size: 10pt; font-weight: bold; margin: 0.4mm 0; font-style: normal; text-transform: none; background: none; color: inherit; padding: 0; }
.fl-item .fl-card { border: 1px dashed #000; padding: 0.8mm; }
.fl-item .fl-mode { text-align: center; border: 1px solid #000; padding: 0.8mm; }
.fl-item .fl-name { font-size: 11pt; text-transform: uppercase; }
.fl-item .fl-total { font-size: 11pt; }
.fl-sep { font-size: 10pt; line-height: 1; margin: 1mm 0; }
`;
