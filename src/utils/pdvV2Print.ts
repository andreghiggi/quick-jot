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
  const w = payload.paperSize === '58mm' ? '58mm' : '80mm';
  const ref = payload.shortCode || `#${payload.dailyNumber}`;
  const itemsHtml = payload.items
    .map((it) => {
      const subtotal = (it.price * it.quantity).toFixed(2).replace('.', ',');
      const unit = it.price.toFixed(2).replace('.', ',');
      return `<div class="row">
          <div class="row-main"><span class="qty">${it.quantity}x</span> ${escapeHtml(it.name)}</div>
          <div class="row-sub">
            <span>${it.quantity} x ${unit}</span>
            <span class="sub-val">R$ ${subtotal}</span>
          </div>
          ${it.notes ? `<div class="row-notes">- ${escapeHtml(it.notes)}</div>` : ''}
        </div>`;
    })
    .join('');
  const now = new Date();
  const ts = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${w} auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      width: ${w};
      font-family: 'Courier New', monospace;
      padding: 4px 6px;
      margin: 0;
      font-size: 11pt;
      line-height: 1.15;
      color: #000;
    }
    .title { text-align:center; font-weight:bold; font-size:14pt; margin:2px 0; letter-spacing:1px; }
    .ped { text-align:center; font-weight:bold; font-size:22pt; margin:2px 0; letter-spacing:2px; }
    .code { text-align:center; font-size:9pt; margin-bottom:2px; }
    .sep { border:0; border-top:1px dashed #000; margin:4px 0; }
    .info { font-size:10pt; }
    .info b { font-weight:bold; }
    .row { margin:2px 0; }
    .row-main { font-size:11pt; font-weight:bold; }
    .qty { font-weight:bold; }
    .row-sub { display:flex; justify-content:space-between; font-size:9pt; padding-left:2px; }
    .sub-val { font-weight:bold; }
    .row-notes { font-size:9pt; padding-left:2px; font-style:italic; }
    .totals { font-size:11pt; }
    .total-line { display:flex; justify-content:space-between; font-weight:bold; font-size:14pt; margin-top:2px; }
    .obs { font-size:10pt; font-weight:bold; padding:2px; border:1px solid #000; }
    .foot { text-align:center; font-size:9pt; margin-top:4px; }
  </style></head><body>
    <div class="title">*** RECIBO ***</div>
    <div class="ped">PED ${escapeHtml(ref)}</div>
    <div class="code">${escapeHtml(payload.orderCode)}</div>
    <hr class="sep"/>
    <div class="info"><b>CLIENTE:</b> ${escapeHtml(payload.customerName)}</div>
    <div class="info"><b>EMISSAO:</b> ${ts}</div>
    <hr class="sep"/>
    ${itemsHtml}
    <hr class="sep"/>
    <div class="totals">
      <div class="total-line"><span>TOTAL</span><span>R$ ${payload.total.toFixed(2).replace('.', ',')}</span></div>
    </div>
    ${payload.notes ? `<hr class="sep"/><div class="obs">OBS: ${escapeHtml(payload.notes)}</div>` : ''}
    <hr class="sep"/>
    <div class="foot">Obrigado pela preferencia!</div>
  </body></html>`;
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
