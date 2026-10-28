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
export function renderFloristItemsHTML(items: FloristPrintItem[], opts?: { production?: boolean }): string {
  if (opts?.production) return renderFloristProductionItemsHTML(items);
  return renderFloristReceiptItemsHTML(items);
}

/** Linhas comuns (dados, endereço invertido, cartão em caixa) usadas no recibo e na comanda. */
function floristDetailRows(it: FloristPrintItem): string[] {
  const d = it.destination;
  const out: string[] = [];
  const ln = (label: string, value: string) =>
    `<div class="fl-line description add-line"><b>${label}:</b> <span class="fl-val">${value}</span></div>`;
  for (const g of it.groupedOptionals || []) {
    g.items.split(/,(?!\s*\d{2}\s*(?:,|$))/).map((s) => s.trim()).filter(Boolean)
      .forEach((a) => out.push(`<div class="fl-line description add-line">+ ${esc(a)}</div>`));
  }
  out.push('<div class="fl-line fl-blank">&nbsp;</div>');
  if (d?.date) {
    out.push(ln(d.mode === 'delivery' ? 'DATA DE ENTREGA' : 'DATA DE RETIRADA', esc(d.date.split('-').reverse().join('/'))));
    if ((d.slot || '').trim()) out.push(ln('HORÁRIO', esc(d.slot!.trim().replace(/\s*[–—]\s*/g, '-'))));
    const ready = floristReadyLabel(d);
    if (ready) out.push(ln('PRONTO ATÉ', esc(ready)));
  }
  const rec = (d?.recipientName || '').trim();
  const tel = (d?.recipientPhone || '').trim();
  if (rec) out.push(ln('RECEBE', esc(rec)));
  if (tel) out.push(ln('TEL', esc(tel)));
  if (d?.mode === 'delivery') {
    out.push('<div class="fl-line fl-blank">&nbsp;</div>');
    out.push('<div class="fl-line fl-label">ENDEREÇO DE ENTREGA:</div>');
    let rua = `${(d.street || '').trim()}, ${(d.number || '').trim()}`;
    if ((d.complement || '').trim()) rua += ` (${d.complement!.trim()})`;
    const rows = [esc(rua)];
    if ((d.neighborhood || '').trim()) rows.push(esc(d.neighborhood!.trim()));
    if ((d.reference || '').trim()) rows.push(`REF.: ${esc(d.reference!.trim())}`);
    out.push(`<div class="fl-inv">${rows.map((r) => `<div>${r}</div>`).join('')}</div>`);
  }
  const msg = (d?.cardMessage || '').trim();
  if (d?.forWhom === 'gift' && msg) {
    out.push('<div class="fl-line fl-blank">&nbsp;</div>');
    out.push('<div class="fl-line fl-label">MENSAGEM DO CARTÃO:</div>');
    out.push(`<div class="fl-cardbox">${esc(msg)}</div>`);
  }
  const notes = parseDestinationFromNotes(it.notes).rest;
  if (notes) out.push(`<div class="fl-line fl-label">OBS: ${esc(notes)}</div>`);
  return out;
}

const nameRow = (it: FloristPrintItem) =>
  `<div class="fl-line fl-name item-name"><span class="qty">[${it.quantity}x]</span> <span class="name">${esc(it.name.toUpperCase())}</span></div>`;

/** Recibo floral (modelo da foto): faixa de modalidade antes do produto, dados, endereço invertido, cartão em caixa e valores. */
function renderFloristReceiptItemsHTML(items: FloristPrintItem[]): string {
  const fees = floristItemFees(items);
  const money2 = (label: string, value: string, extra = '') =>
    `<div class="fl-money${extra ? ' ' + extra : ''}"><span>${label}</span><span>${value}</span></div>`;
  return items
    .map((it, i) => {
      const d = it.destination;
      const out: string[] = [];
      if (d) {
        const modo = d.mode === 'delivery' ? 'ENTREGA' : 'RETIRADA';
        const quem = d.forWhom === 'gift' ? 'PRESENTE' : 'COMPRADOR';
        out.push(`<div class="fl-modeband">${modo} - ${quem}</div>`);
      }
      out.push(nameRow(it));
      out.push(...floristDetailRows(it));
      const prod = it.price * it.quantity;
      out.push('<div class="fl-line fl-blank">&nbsp;</div>');
      out.push(money2('VALOR:', money(prod)));
      out.push(money2('ENTREGA:', money(fees[i])));
      out.push(money2('TOTAL DO ITEM:', money(prod + fees[i]), 'fl-money-total'));
      return `<div class="item fl-item fl-prod fl-receipt">${out.join('')}</div>`;
    })
    .join('<div class="fl-sep">--------------------------------</div>');
}

/** Cabeçalho "ENTREGA - PRESENTE" da comanda de produção floral. */
export function floristProductionModeLabel(d?: FloristDestination | null): string {
  if (!d) return '';
  const modo = d.mode === 'delivery' ? 'ENTREGA' : 'RETIRADA';
  const quem = d.forWhom === 'gift' ? 'PRESENTE' : 'COMPRADOR';
  return `&gt;&gt; ${modo} - ${quem} &lt;&lt;`;
}

/** Comanda de produção floral (modelo da foto): sem valores, endereço invertido e cartão em caixa. */
function renderFloristProductionItemsHTML(items: FloristPrintItem[]): string {
  const ln = (label: string, value: string) =>
    `<div class="fl-line description add-line"><b>${label}:</b> <span class="fl-val">${value}</span></div>`;
  return items
    .map((it) => {
      const d = it.destination;
      const out: string[] = [];
      out.push(`<div class="fl-line fl-name item-name"><span class="qty">[${it.quantity}x]</span> <span class="name">${esc(it.name.toUpperCase())}</span></div>`);
      for (const g of it.groupedOptionals || []) {
        g.items.split(/,(?!\s*\d{2}\s*(?:,|$))/).map((s) => s.trim()).filter(Boolean)
          .forEach((a) => out.push(`<div class="fl-line description add-line">+ ${esc(a)}</div>`));
      }
      out.push('<div class="fl-line fl-blank">&nbsp;</div>');
      if (d?.date) {
        out.push(ln(d.mode === 'delivery' ? 'DATA DE ENTREGA' : 'DATA DE RETIRADA', esc(d.date.split('-').reverse().join('/'))));
        if ((d.slot || '').trim()) out.push(ln('HORÁRIO', esc(d.slot!.trim().replace(/\s*[–—]\s*/g, '-'))));
        const ready = floristReadyLabel(d);
        if (ready) out.push(ln('PRONTO ATÉ', esc(ready)));
      }
      const rec = (d?.recipientName || '').trim();
      const tel = (d?.recipientPhone || '').trim();
      if (rec) out.push(ln('RECEBE', esc(rec)));
      if (tel) out.push(ln('TEL', esc(tel)));
      if (d?.mode === 'delivery') {
        out.push('<div class="fl-line fl-blank">&nbsp;</div>');
        out.push('<div class="fl-line fl-label">ENDEREÇO DE ENTREGA:</div>');
        let rua = `${(d.street || '').trim()}, ${(d.number || '').trim()}`;
        if ((d.complement || '').trim()) rua += ` (${d.complement!.trim()})`;
        const rows = [esc(rua)];
        if ((d.neighborhood || '').trim()) rows.push(esc(d.neighborhood!.trim()));
        if ((d.reference || '').trim()) rows.push(`REF.: ${esc(d.reference!.trim())}`);
        out.push(`<div class="fl-inv">${rows.map((r) => `<div>${r}</div>`).join('')}</div>`);
      }
      const msg = (d?.cardMessage || '').trim();
      if (d?.forWhom === 'gift' && msg) {
        out.push('<div class="fl-line fl-blank">&nbsp;</div>');
        out.push('<div class="fl-line fl-label">MENSAGEM DO CARTÃO:</div>');
        out.push(`<div class="fl-cardbox">${esc(msg)}</div>`);
      }
      const notes = parseDestinationFromNotes(it.notes).rest;
      if (notes) out.push(`<div class="fl-line fl-label">OBS: ${esc(notes)}</div>`);
      return `<div class="item fl-item fl-prod">${out.join('')}</div>`;
    })
    .join('<div class="fl-sep">--------------------------------</div>');
}

export const FLORIST_PRODUCTION_CSS = `
.fl-header { border: 2px solid #000; padding: 0; margin: 2mm 0; text-align: left; }
.fl-header .fl-h-title { font-size: 14pt; font-weight: 900; padding: 2mm 2mm 1mm; }
.fl-header .fl-h-mode { font-size: 13pt; font-weight: 900; padding: 1mm 2mm 2mm; }
.fl-header .fl-h-client { background: #000 !important; color: #fff !important; font-size: 13pt; font-weight: 900; padding: 1mm 2mm; }
.fl-header .fl-h-date { text-align: center; font-size: 11pt; padding: 1mm 2mm; }
.fl-prod .fl-name { font-size: 13pt; font-weight: 900; margin-bottom: 1mm; }
.fl-prod .fl-line { font-size: 10.5pt; margin: 0.5mm 0; background: none; color: inherit; text-transform: none; font-style: normal; padding: 0; }
.fl-prod .fl-line b { font-weight: 900; }
.fl-prod .fl-val { font-weight: normal; }
.fl-prod .fl-label { font-weight: 900; }
.fl-prod .fl-inv { background: #000 !important; color: #fff !important; font-weight: bold; font-size: 10.5pt; padding: 1mm 1.5mm; margin: 0.5mm 0 1mm; }
.fl-prod .fl-cardbox { border: 2px solid #000; padding: 1.5mm; font-size: 10.5pt; margin-top: 0.5mm; }
@media print { .fl-header .fl-h-client, .fl-prod .fl-inv { background: #000 !important; color: #fff !important; } }
`;

export const FLORIST_PRINT_CSS = `
.fl-item { margin: 1.5mm 0; }
.fl-receipt .fl-modeband { background: #000 !important; color: #fff !important; text-align: center; font-size: 11pt; font-weight: 900; padding: 1mm 1.5mm; margin: 0.5mm 0 1.5mm; }
.fl-receipt .fl-name { font-size: 12pt; font-weight: 900; margin-bottom: 1mm; }
.fl-receipt .fl-line { font-size: 10.5pt; margin: 0.5mm 0; background: none; color: inherit; text-transform: none; font-style: normal; padding: 0; }
.fl-receipt .fl-line b { font-weight: 900; }
.fl-receipt .fl-val { font-weight: normal; }
.fl-receipt .fl-label { font-weight: 900; }
.fl-receipt .fl-inv { background: #000 !important; color: #fff !important; font-weight: bold; font-size: 10.5pt; padding: 1mm 1.5mm; margin: 0.5mm 0 1mm; }
.fl-receipt .fl-cardbox { border: 2px solid #000; padding: 1.5mm; font-size: 10.5pt; margin-top: 0.5mm; }
.fl-receipt .fl-money { display: flex; justify-content: space-between; font-size: 10.5pt; margin: 0.3mm 0; }
.fl-receipt .fl-money-total { font-weight: 900; }
@media print { .fl-receipt .fl-modeband, .fl-receipt .fl-inv { background: #000 !important; color: #fff !important; } }
.fl-sep { font-size: 10pt; line-height: 1; margin: 1mm 0; }
`;
