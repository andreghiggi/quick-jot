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
      // 1) Produto
      out.push(`<div class="fl-line fl-name item-name"><span class="qty">[${it.quantity}x]</span> <span class="name">${esc(it.name.toUpperCase())}</span></div>`);
      for (const g of it.groupedOptionals || []) {
        g.items
          .split(/,(?!\s*\d{2}\s*(?:,|$))/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((a) => out.push(line(`+ ${esc(a)}`)));
      }
      // 2) Modalidade, data, horário e pronto até (por produto)
      if (d) {
        const modo = d.mode === 'delivery' ? '🛵 ENTREGA' : '🏪 RETIRADA NA LOJA';
        const quem = d.forWhom === 'gift' ? '🎁 PRESENTE' : 'PARA O COMPRADOR';
        out.push(line(`${modo} — ${quem}`, 'fl-mode fl-gap'));
      }
      if (d?.date) {
        out.push(line(`DATA: ${esc(d.date.split('-').reverse().join('/'))}`));
        if ((d.slot || '').trim()) out.push(line(`HORÁRIO: ${esc(d.slot!.trim())}`));
        const ready = floristReadyLabel(d);
        if (ready) out.push(line(`PRONTO ATÉ: ${esc(ready)}`, 'fl-ready'));
      }
      // 3) Quem recebe
      const rec = (d?.recipientName || '').trim();
      const tel = (d?.recipientPhone || '').trim();
      if (rec) out.push(line(`RECEBE: ${esc(rec)}`, 'fl-gap'));
      if (tel) out.push(line(`TEL: ${esc(tel)}`, rec ? '' : 'fl-gap'));
      // 4) Endereço em linhas separadas
      if (d?.mode === 'delivery') {
        out.push(line('ENDEREÇO:', 'fl-gap'));
        let rua = `${(d.street || '').trim()}, ${(d.number || '').trim()}`;
        if ((d.complement || '').trim()) rua += ` (${d.complement!.trim()})`;
        out.push(line(esc(rua)));
        if ((d.neighborhood || '').trim()) out.push(line(esc(d.neighborhood!.trim())));
        if ((d.reference || '').trim()) out.push(line(`REF.: ${esc(d.reference!.trim())}`));
      }
      // 5) Mensagem do cartão
      const msg = (d?.cardMessage || '').trim();
      if (d?.forWhom === 'gift' && msg) {
        out.push(line('MENSAGEM DO CARTÃO:', 'fl-gap'));
        out.push(`<div class="fl-line fl-card obs-text item-notes">[OBS]${esc(msg)}[/OBS]</div>`);
      }
      const notes = parseDestinationFromNotes(it.notes).rest;
      if (notes) out.push(`<div class="fl-line obs-text item-notes fl-gap">[OBS]Obs: ${esc(notes)}[/OBS]</div>`);
      // 6) Valores
      const prod = it.price * it.quantity;
      out.push(line(`PRODUTO: ${money(prod)}`, 'fl-gap'));
      out.push(line(`ENTREGA: ${money(fees[i])}`));
      out.push(line(`TOTAL DO ITEM: ${money(prod + fees[i])}`, 'fl-total'));
      const sep = i < items.length - 1 ? '<div class="fl-sep">--------------------------------</div>' : '';
      return `<div class="item fl-item">${out.join('')}</div>${sep}`;
    })
    .join('');
}

export const FLORIST_PRINT_CSS = `
.fl-item { margin: 1.5mm 0; }
.fl-item .fl-line { font-size: 10pt; font-weight: bold; margin: 0.4mm 0; font-style: normal; text-transform: none; background: none; color: inherit; padding: 0; }
.fl-item .fl-gap { margin-top: 2.5mm; }
.fl-item .fl-card { border: 1px dashed #000; padding: 0.8mm; font-weight: normal; }
.fl-item .fl-mode { font-size: 10.5pt; }
.fl-item .fl-ready { font-size: 10.5pt; }
.fl-item .fl-name { font-size: 11.5pt; }
.fl-item .fl-total { font-size: 11pt; }
.fl-sep { font-size: 10pt; line-height: 1; margin: 1mm 0; }
`;
