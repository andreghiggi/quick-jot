/**
 * Wrappers de impressão exclusivos do PDV V2.
 * Reusa a função existente generateProductionTicketHTML() sem modificá-la.
 *
 * Regras:
 *  - cardapio (online)  → produção + recibo
 *  - balcao (novo)      → produção + recibo
 *  - mesa (garçom)      → apenas produção
 *  - importMesa         → apenas recibo
 */
import { generateProductionTicketHTML } from '@/utils/printProductionTicket';
import { supabase } from '@/integrations/supabase/client';
import { computeReadyOffsetMinutes } from '@/utils/estimatedReadyOffset';

interface PrintItem {
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

interface PrintPayload {
  companyId: string;
  orderCode: string;
  dailyNumber: number;
  shortCode?: string;
  customerName: string;
  items: PrintItem[];
  total: number;
  notes?: string;
  paperSize?: '58mm' | '80mm';
  /** Texto livre do campo "Prazo estimado de entrega" (estimated_wait_time).
   *  Usado apenas para Lancheria I9 para calcular "Pronto até = criação + (max − 10 min)". */
  estimatedWaitTime?: string | null;
}

async function enqueue(companyId: string, label: string, html: string) {
  await supabase.from('print_queue').insert({
    company_id: companyId,
    html_content: html,
    label,
  });
}

function buildReceiptHTML(payload: PrintPayload): string {
  const w = payload.paperSize === '58mm' ? '58mm' : '80mm';
  const itemsHtml = payload.items
    .map(
      (it) =>
        `<div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>${it.quantity}× ${escapeHtml(it.name)}</span>
          <span>R$ ${(it.price * it.quantity).toFixed(2).replace('.', ',')}</span>
        </div>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${w} auto; margin: 0; }
    body { width: ${w}; font-family: monospace; padding: 8px; margin: 0; }
    h2 { text-align:center; margin: 4px 0; font-size:14px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .total { font-weight:bold; font-size:14px; display:flex; justify-content:space-between; }
  </style></head><body>
    <h2>RECIBO</h2>
    <div style="font-size:14px;font-weight:bold;">${payload.shortCode ? escapeHtml(payload.shortCode) : `Pedido #${payload.dailyNumber}`}</div>
    <div style="font-size:10px;">${escapeHtml(payload.orderCode)}</div>
    <div style="font-size:12px;">Cliente: ${escapeHtml(payload.customerName)}</div>
    <hr/>
    ${itemsHtml}
    <hr/>
    <div class="total"><span>TOTAL</span><span>R$ ${payload.total.toFixed(2).replace('.', ',')}</span></div>
    ${payload.notes ? `<hr/><div style="font-size:11px;">${escapeHtml(payload.notes)}</div>` : ''}
    <hr/>
    <div style="text-align:center;font-size:10px;">${new Date().toLocaleString('pt-BR')}</div>
  </body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * Recibo V3 — layout denso inspirado na referência Agilize.
 * Atualmente exclusivo da Lancheria da I9 (rollout isolado).
 * Mantém V1/V2 intactos.
 */
const I9_COMPANY_ID_V3 = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';

function buildReceiptHTMLv3(payload: PrintPayload): string {
  // Layout V3 — template ESC/POS Epson TM-T20/TM-T88 (Font A monoespaçada).
  // Renderizado como <pre> com colunas fixas (42 cols @ 80mm, 32 cols @ 58mm),
  // line-height 1.0, Courier New único, faixa de modalidade em texto invertido.
  // Mantém compatibilidade total com V1/V2 (função isolada por companyId).
  const w = payload.paperSize === '58mm' ? '58mm' : '80mm';
  const COLS = w === '80mm' ? 42 : 32;
  const VAL_COL = 12; // largura reservada à direita para "R$ 9999,99"
  const DESC_COL = COLS - VAL_COL;

  const ref = payload.shortCode || `#${payload.dailyNumber}`;
  const lojaNome = 'LANCHERIA DA I9';
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const modalidade = 'BALCAO';

  // ----- helpers de coluna (string monoespaçada) -----
  const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const line = (ch: string) => ch.repeat(COLS);
  const center = (s: string) => {
    const t = s.length > COLS ? s.slice(0, COLS) : s;
    const pad = Math.max(0, Math.floor((COLS - t.length) / 2));
    return ' '.repeat(pad) + t;
  };
  const twoCol = (left: string, right: string) => {
    const r = right.slice(0, VAL_COL);
    const maxLeft = COLS - r.length - 1;
    const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
    return l + ' '.repeat(COLS - l.length - r.length) + r;
  };
  const wrap = (s: string, width: number, indent = 0): string[] => {
    const out: string[] = [];
    const ind = ' '.repeat(indent);
    const eff = width - indent;
    let cur = '';
    for (const word of s.split(/\s+/)) {
      if (!word) continue;
      if ((cur + (cur ? ' ' : '') + word).length > eff) {
        if (cur) out.push(ind + cur);
        cur = word;
      } else {
        cur = cur ? `${cur} ${word}` : word;
      }
    }
    if (cur) out.push(ind + cur);
    return out.length ? out : [ind];
  };

  // ----- bloco de itens -----
  const itemLines: string[] = [];
  payload.items.forEach((it) => {
    const nome = it.name || 'Item';
    let main = nome;
    const adicionais: string[] = [];
    const idxP = nome.indexOf('(');
    if (idxP >= 0 && nome.endsWith(')')) {
      main = nome.slice(0, idxP).trim();
      const extras = nome.slice(idxP + 1, -1).trim();
      const grupos = extras.split('|').map((g) => g.trim()).filter(Boolean);
      for (const g of grupos) {
        const after = g.includes(':') ? g.split(':').slice(1).join(':') : g;
        for (const p of after.split(',').map((s) => s.trim()).filter(Boolean)) {
          const clean = p.replace(/\s*R\$\s*[\d.,]+\s*$/, '').trim();
          if (clean) adicionais.push(clean);
        }
      }
    }
    const sub = it.price * it.quantity;
    const header = `${it.quantity} X ${main.toUpperCase()}`;
    const wrapped = wrap(header, DESC_COL);
    // primeira linha leva o valor à direita; demais ficam só com a descrição
    itemLines.push(twoCol(wrapped[0], money(sub)));
    for (let i = 1; i < wrapped.length; i++) itemLines.push(wrapped[i]);
    adicionais.forEach((ad, i) => {
      const txt = `[${i + 1}] ${ad}`;
      wrap(txt, COLS, 2).forEach((l) => itemLines.push(l));
    });
    if (it.notes) {
      wrap(`Obs: ${it.notes}`, COLS, 2).forEach((l) => itemLines.push(l));
    }
  });

  // ----- montagem do recibo (string única, coluna a coluna) -----
  const out: string[] = [];
  out.push(center(lojaNome));
  out.push('');
  out.push(center(`PED ${ref}`));
  out.push(line('-'));
  out.push(`CLIENTE: ${payload.customerName}`);
  // faixa de modalidade — equivalente ESC/POS reverse video (GS B 1)
  // marcador especial REV_START/REV_END processado abaixo no render HTML
  out.push('__REV__' + center(modalidade));
  out.push(line('-'));
  out.push(twoCol('DESCRICAO', 'VALOR'));
  out.push(line('-'));
  itemLines.forEach((l) => out.push(l));
  out.push(line('-'));
  out.push(twoCol('TOTAL GERAL', money(payload.total)));
  if (payload.notes) {
    out.push(line('-'));
    wrap(`Obs: ${payload.notes}`, COLS).forEach((l) => out.push(l));
  }
  out.push(line('-'));
  out.push(twoCol(`COD: ${(payload.orderCode || '').slice(0, 7).toLowerCase()}`, 'PDV V2'));
  out.push(twoCol('Impresso em', ts));
  out.push(line('-'));
  out.push(center('Obrigado pela preferencia!'));

  // ----- render: cada linha vira <div>, faixa invertida usa background preto -----
  const bodyHtml = out
    .map((raw) => {
      if (raw.startsWith('__REV__')) {
        const txt = raw.slice('__REV__'.length);
        return `<div class="rev">${escapeHtml(txt)}</div>`;
      }
      // espaços preservados; linha vazia mantém altura
      const safe = escapeHtml(raw).replace(/ /g, '&nbsp;');
      return `<div class="ln">${safe || '&nbsp;'}</div>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${w} auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${w}; max-width: ${w};
      font-family: 'Courier New', monospace;
      font-size: ${w === '80mm' ? '10pt' : '9pt'};
      line-height: 1.0;
      color: #000;
      padding: 2mm;
    }
    .ln { white-space: pre; font-family: 'Courier New', monospace; }
    .rev {
      background: #000;
      color: #fff;
      font-weight: bold;
      white-space: pre;
      font-family: 'Courier New', monospace;
    }
  </style></head><body>${bodyHtml}</body></html>`;
}

function buildReceiptHTMLForCompany(payload: PrintPayload): string {
  if (payload.companyId === I9_COMPANY_ID_V3) {
    return buildReceiptHTMLv3(payload);
  }
  return buildReceiptHTML(payload);
}

function buildProductionHtml(payload: PrintPayload, ref: string) {
  const isLancheriaI9 = true;
  return generateProductionTicketHTML({
    tabNumber: payload.dailyNumber,
    customerName: payload.customerName,
    items: payload.items.map((i) => ({
      productName: i.name,
      quantity: i.quantity,
      notes: i.notes || null,
    })),
    createdAt: new Date(),
    paperSize: payload.paperSize || '80mm',
    referenceLabel: ref,
    companyId: payload.companyId,
    // Lancheria I9: previsão = criação + (máximo do prazo estimado − 10 min).
    // Lê dinamicamente "Prazo estimado de entrega" (Configurações → WhatsApp).
    showReadyTime: isLancheriaI9,
    readyOffsetMinutes: isLancheriaI9
      ? computeReadyOffsetMinutes(payload.estimatedWaitTime, 30)
      : undefined,
  });
}

export async function printOnlineOrBalcao(payload: PrintPayload) {
  const ref = payload.shortCode ? `PEDIDO ${payload.shortCode}` : `PEDIDO #${payload.dailyNumber}`;
  const label = payload.shortCode || `#${payload.dailyNumber}`;
  const productionHtml = buildProductionHtml(payload, ref);
  await enqueue(payload.companyId, `Produção ${label}`, productionHtml);
  await enqueue(payload.companyId, `Recibo ${label}`, buildReceiptHTMLForCompany(payload));
}

export async function printOnlyReceipt(payload: PrintPayload) {
  const label = payload.shortCode || `#${payload.dailyNumber}`;
  await enqueue(payload.companyId, `Recibo ${label}`, buildReceiptHTMLForCompany(payload));
}
