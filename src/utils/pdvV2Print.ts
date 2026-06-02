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
  // Layout V3 fiel ao recibo térmico Agilize: cabeçalho da loja, PED #,
  // cliente, faixa de modalidade, tabela REF/DESCRICAO/VALOR com adicionais
  // numerados, totais (ITENS/FRETE/TOTAL GERAL), pagamento e meta de criação.
  // Usa apenas dados do PrintPayload — sem expandir tipo nem callers (TEF/PDV V2 congelados).
  const w = payload.paperSize === '58mm' ? '58mm' : '80mm';
  const cols = w === '80mm' ? 42 : 32;
  const ref = payload.shortCode || `#${payload.dailyNumber}`;
  const lojaNome = 'LANCHERIA DA I9'; // V3 isolado por loja; nome puxado pelo header do recibo
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // Itens com formato Agilize
  const itemsHtml = payload.items
    .map((it) => {
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
      const unit = it.price.toFixed(2).replace('.', ',');
      const sub = (it.price * it.quantity).toFixed(2).replace('.', ',');
      let block = `<div class="ref-row"><b>${escapeHtml(main.toUpperCase())} R$ ${unit}</b></div>`;
      adicionais.forEach((ad, i) => {
        block += `<div class="ad-line">[${i + 1}] ${escapeHtml(ad)}</div>`;
      });
      if (it.notes) block += `<div class="ad-line">Obs: ${escapeHtml(it.notes)}</div>`;
      block += `<div class="line-total"><span>${it.quantity} X R$ ${unit} =</span><span>R$ ${sub}</span></div>`;
      return `<div class="item-block">${block}</div>`;
    })
    .join('');

  const modalidade = 'BALCAO';
  const hash = '#'.repeat(cols);
  const mid = `#${modalidade.padStart(Math.floor((cols - 2 + modalidade.length) / 2), ' ').padEnd(cols - 2, ' ')}#`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${w} auto; margin: 0; }
    * { box-sizing: border-box; margin:0; padding:0; }
    body {
      width:${w}; max-width:${w};
      font-family:'Lucida Console','Consolas','Courier New',monospace;
      padding:2mm; font-size:9pt; line-height:1.15; color:#000;
    }
    .head { text-align:center; font-size:8.5pt; line-height:1.2; }
    .head .nome { font-weight:bold; font-size:9pt; }
    .ped { text-align:center; font-weight:bold; font-size:14pt; margin:2mm 0 1mm; letter-spacing:2px; }
    .sep { border:0; border-top:1px dashed #000; margin:1.5mm 0; }
    .cli-line { font-size:9pt; margin:0.5mm 0; }
    .cli-line b { font-weight:bold; }
    .modalidade { font-family:'Courier New',monospace; font-size:8pt; text-align:center; margin:1.5mm 0; line-height:1.1; white-space:pre; font-weight:bold; }
    .ref-head { display:flex; justify-content:space-between; font-size:8.5pt; border-bottom:1px solid #000; padding-bottom:0.5mm; margin-bottom:1mm; font-weight:bold; }
    .item-block { margin:1mm 0; }
    .ref-row { font-size:9.5pt; font-weight:bold; }
    .ad-line { font-size:8.5pt; padding-left:3mm; }
    .line-total { display:flex; justify-content:flex-end; gap:3mm; font-size:8.5pt; margin-top:0.5mm; }
    .totais { font-size:9pt; }
    .tot-line { display:flex; justify-content:space-between; padding:0.3mm 0; }
    .tot-line.bold { font-weight:bold; font-size:11pt; }
    .meta { display:flex; justify-content:space-between; font-size:8pt; padding:0.2mm 0; }
    .meta-block { margin:1mm 0; }
    .foot { text-align:center; font-size:8pt; margin-top:1mm; }
  </style></head><body>
    <div class="head"><div class="nome">${escapeHtml(lojaNome)}</div></div>
    <div class="ped">PED ${escapeHtml(ref)}</div>
    <hr class="sep"/>
    <div class="cli-line"><b>CLIENTE:</b> ${escapeHtml(payload.customerName)}</div>
    <div class="modalidade">${hash}
${mid}
${hash}</div>
    <div class="ref-head"><span>REF| DESCRICAO</span><span>| VALOR</span></div>
    ${itemsHtml}
    <hr class="sep"/>
    <div class="totais">
      <div class="tot-line bold"><span>TOTAL GERAL</span><span>R$ ${payload.total.toFixed(2).replace('.', ',')}</span></div>
    </div>
    ${payload.notes ? `<hr class="sep"/><div class="cli-line"><b>Obs:</b> ${escapeHtml(payload.notes)}</div>` : ''}
    <hr class="sep"/>
    <div class="meta-block">
      <div class="meta"><span>COD: ${escapeHtml((payload.orderCode || '').slice(0, 7).toLowerCase())}</span><span>PDV V2</span></div>
      <div class="meta"><span>Impresso em</span><span>${ts}</span></div>
    </div>
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
