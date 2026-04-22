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
  customerName: string;
  items: PrintItem[];
  total: number;
  notes?: string;
  paperSize?: '58mm' | '80mm';
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
    <div style="font-size:12px;">Pedido #${payload.dailyNumber} (${escapeHtml(payload.orderCode)})</div>
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

function buildProductionHtml(payload: PrintPayload, ref: string) {
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
    // Lancheria I9: prazo estimado 20–40 min → previsão = criação + 30 min (máximo − 10 min)
    showReadyTime: payload.companyId === '8c9e7a0e-dbb6-49b9-8344-c23155a71164',
    readyOffsetMinutes: 30,
  });
}

export async function printOnlineOrBalcao(payload: PrintPayload) {
  const productionHtml = buildProductionHtml(payload, `PEDIDO #${payload.dailyNumber}`);
  await enqueue(payload.companyId, `Produção #${payload.dailyNumber}`, productionHtml);
  await enqueue(payload.companyId, `Recibo #${payload.dailyNumber}`, buildReceiptHTML(payload));
}

export async function printOnlyReceipt(payload: PrintPayload) {
  await enqueue(payload.companyId, `Recibo #${payload.dailyNumber}`, buildReceiptHTML(payload));
}
