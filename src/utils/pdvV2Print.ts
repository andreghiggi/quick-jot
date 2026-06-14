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
  /** Adicionais agrupados (I9). Quando presente, recibo V2 e comanda V2
   *  renderizam rótulo do grupo (■ sublinhado) + itens (+ CAPS). 1 grupo
   *  esconde o rótulo. Quando ausente, comportamento legado preservado. */
  groupedOptionals?: { groupName: string; items: string }[];
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
  /** Layout de impressão selecionado em Configurações (`print_layout`).
   *  Quando omitido, mantém o comportamento legado (V1 ou V3 forçado para I9).
   *  Quando fornecido, respeita a escolha do lojista (V1/V2/V3). */
  printLayout?: 'v1' | 'v2' | 'v3';
  /** Endereço de entrega (I9 only). Renderizado em bloco invertido no recibo
   *  e propagado para a comanda V2. */
  deliveryAddress?: string | null;
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
  // V2 layout: markers ([ADD] com valor, [ADDGROUP_LABEL], [ENDERECO], [CLIENTE])
  // são emitidos para todas as lojas que usam o layout V2. O auto_printer.py
  // v8.34+ interpreta; versões anteriores ignoram (retrocompatível).
  const isV2 = true;
  const itemsHtml = payload.items
    .map((it) => {
      const head = `<div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>${it.quantity}× ${escapeHtml(it.name)}</span>
          <span>R$ ${(it.price * it.quantity).toFixed(2).replace('.', ',')}</span>
        </div>`;
      // V2 layout: adicionais agrupados via markers que o auto_printer interpreta.
      // 1 grupo: sem rótulo; 2+ grupos: rótulo ■ sublinhado.
      if (!isV2 || !it.groupedOptionals || it.groupedOptionals.length === 0) return head;
      const groups = it.groupedOptionals;
      const single = groups.length === 1;
      const groupsHtml = groups
        .map((g) => {
          const itensHtml = g.items
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((x) => {
              const m = x.match(/\s*R\$\s*([\d.,]+)\s*$/);
              const clean = x.replace(/\s*R\$\s*[\d.,]+\s*$/, '').trim();
              const priceSuffix = m ? `  R$ ${m[1]}` : '';
              return `<div class="add-line">&gt;&gt; ${escapeHtml(clean + priceSuffix)}</div>`;
            })
            .join('');
          const labelHtml = single
            ? ''
            : `<div class="add-group-label">[ADDGROUP_LABEL]${escapeHtml(g.groupName)}[/ADDGROUP_LABEL]</div>`;
          return labelHtml + itensHtml;
        })
        .join('');
      return head + groupsHtml;
    })
    .join('');

  // V2: "Pronto até" no cabeçalho do recibo, logo abaixo do Cliente.
  // Calcula como criação + (máximo do prazo estimado − 10 min). Fallback 30min.
  // Ativo para todas as lojas com layout V2 marcado.
  let prontoAteHtml = '';
  if (isV2) {
    const offset = computeReadyOffsetMinutes(payload.estimatedWaitTime, 30);
    const ready = new Date(Date.now() + offset * 60 * 1000);
    const readyTs = ready.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit', minute: '2-digit',
    });
    prontoAteHtml = `<div style="font-size:13px;font-weight:bold;text-transform:uppercase;margin-top:2px;">Pronto até: ${readyTs}</div>`;
  }

  // V2: endereço de entrega em bloco invertido (mesmo estilo do nome).
  const enderecoHtml = isV2 && payload.deliveryAddress
    ? `<div style="font-size:12px;">[ENDERECO]${escapeHtml(payload.deliveryAddress)}[/ENDERECO]</div>`
    : '';

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
    <div style="font-size:12px;">${isV2 ? `[CLIENTE]${escapeHtml(payload.customerName)}[/CLIENTE]` : `Cliente: ${escapeHtml(payload.customerName)}`}</div>
    ${enderecoHtml}
    ${prontoAteHtml}
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
  // Layout V3 — réplica fiel do cupom térmico Epson TM-T20/TM-T88 (Font A).
  // Grade FIXA de 48 colunas monoespaçadas (ESC/POS padrão 80mm),
  // fonte Courier New 9pt, line-height 1.0, alinhamento por padding de caractere.
  // Estrutura espelhada da foto de referência (Agilize).
  // Mantém V1/V2 100% intactos (função isolada por companyId).
  const w = '80mm';
  const COLS = 48;

  const ref = payload.shortCode || `#${String(payload.dailyNumber).padStart(3, '0')}`;
  const refDisplay = ref.startsWith('#') ? ref : `#${ref}`;
  const lojaNome = 'LANCHERIA DA I9';
  const now = new Date();
  const ts = now.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const modalidade = 'BALCAO';

  // ---------- helpers ESC/POS ----------
  const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const repeat = (ch: string) => ch.repeat(COLS);
  const center = (s: string) => {
    const t = s.length > COLS ? s.slice(0, COLS) : s;
    const pad = Math.max(0, Math.floor((COLS - t.length) / 2));
    return ' '.repeat(pad) + t;
  };
  /** Alinha valor à direita preservando coluna fixa (padStart no total = COLS). */
  const rightCol = (left: string, right: string) => {
    const r = right.slice(-COLS);
    const maxLeft = COLS - r.length;
    const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
    return l + ' '.repeat(COLS - l.length - r.length) + r;
  };
  /** Linha tipo "LABEL          |             VALOR" (com pipe a ~17 cols). */
  const pipeRow = (label: string, value: string, labelWidth = 17) => {
    const l = label.length > labelWidth ? label.slice(0, labelWidth) : label.padEnd(labelWidth, ' ');
    const v = value.slice(-(COLS - labelWidth - 2));
    const middle = ' '.repeat(Math.max(1, COLS - l.length - 1 - v.length - 1));
    return `${l}|${middle}${v} `;
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

  // ---------- bloco de itens (estilo Agilize) ----------
  const itemLines: string[] = [];
  let totalItens = 0;
  payload.items.forEach((it) => {
    const nome = it.name || 'Item';
    let main = nome;
    // V3 (I9): preserva o nome do grupo. Cada entrada vira "GRUPO: item1, item2".
    const grupoLinhas: { grupo: string; itens: string[] }[] = [];
    const idxP = nome.indexOf('(');
    if (idxP >= 0 && nome.endsWith(')')) {
      main = nome.slice(0, idxP).trim();
      const extras = nome.slice(idxP + 1, -1).trim();
      const grupos = extras.split('|').map((g) => g.trim()).filter(Boolean);
      for (const g of grupos) {
        const hasColon = g.includes(':');
        const grupoNome = hasColon ? g.split(':')[0].trim() : 'Adicionais';
        const after = hasColon ? g.split(':').slice(1).join(':') : g;
        const itens: string[] = [];
        for (const p of after.split(',').map((s) => s.trim()).filter(Boolean)) {
          const clean = p.replace(/\s*R\$\s*[\d.,]+\s*$/, '').trim();
          if (clean) itens.push(clean);
        }
        if (itens.length > 0) grupoLinhas.push({ grupo: grupoNome, itens });
      }
    }
    const sub = it.price * it.quantity;
    totalItens += sub;

    // Cabeçalho do item: "NOME R$ XX,XX" (preço unitário ao lado, sem coluna direita)
    const cab = `${main.toUpperCase()} ${money(it.price)}`;
    wrap(cab, COLS).forEach((l) => itemLines.push(l));

    // Adicionais agrupados: "  GRUPO: item1, item2" (rótulo do grupo bold via marcador)
    grupoLinhas.forEach(({ grupo, itens }) => {
      const linha = `${grupo.toUpperCase()}: ${itens.join(', ')}`;
      wrap(linha, COLS, 3).forEach((l, idx) => {
        // marca apenas a primeira linha do grupo como bold (rótulo está nela)
        itemLines.push(idx === 0 ? '__BOLD__' + l : l);
      });
    });
    if (it.notes) {
      wrap(`Obs: ${it.notes}`, COLS, 3).forEach((l) => itemLines.push(l));
    }

    // Linha de subtotal alinhada à direita: "    Q X R$ 26,00 =   R$ 26,00"
    const calc = `${it.quantity} X ${money(it.price)} =   ${money(sub)}`;
    itemLines.push(rightCol('', calc));
  });

  // ---------- montagem (compacta, espelhando a foto Agilize) ----------
  // Regras: zero linhas em branco entre seções; única ênfase visual é PED #xxx
  // (linha marcada __BIG__). Modalidade vai entre 3 linhas literais de '#'.
  const out: string[] = [];
  out.push(center(lojaNome));
  out.push(repeat('-'));
  out.push('__BIG__' + center(`PED ${refDisplay}`));
  out.push(repeat('-'));
  out.push(`CLIENTE: ${payload.customerName}`);
  // Faixa de modalidade — 3 linhas de '#' literais (como na foto)
  const modBand = ` ${modalidade} / PDV `;
  const padHash = Math.max(0, COLS - modBand.length);
  const left = '#'.repeat(Math.floor(padHash / 2));
  const right = '#'.repeat(padHash - left.length);
  out.push(repeat('#'));
  out.push(`${left}${modBand}${right}`);
  out.push(repeat('#'));
  // Cabeçalho da tabela (sem separador, cola direto nos itens)
  out.push(rightCol('REF| DESCRICAO', 'VALOR'));
  itemLines.forEach((l) => out.push(l));
  out.push(repeat('='));
  // Totais (sem linha em branco entre eles)
  out.push(pipeRow('TOTAL ITENS', money(totalItens)));
  if (Math.abs(payload.total - totalItens) > 0.001) {
    out.push(pipeRow('FRETE', money(payload.total - totalItens)));
  }
  out.push('__BOLD__' + rightCol('TOTAL GERAL', money(payload.total)));
  // Meta direto, sem espaço
  out.push(pipeRow(`COD: ${(payload.orderCode || '').slice(0, 7).toLowerCase()}`, 'App Pedidos'));
  // I9 (V2): remove "Criado em" (redundante com "Impresso em") e adiciona
  // "Pronto até" logo abaixo da data/hora do recibo.
  out.push(pipeRow('Impresso em', ts));
  // V3 layout (atualmente só I9, mas mantém compat se outras lojas marcarem V3).
  if (payload.printLayout === 'v3' || payload.companyId === I9_COMPANY_ID_V3) {
    const offset = computeReadyOffsetMinutes(payload.estimatedWaitTime, 30);
    const ready = new Date(now.getTime() + offset * 60 * 1000);
    const readyTs = ready.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit', minute: '2-digit',
    });
    out.push('__BOLD__' + pipeRow('Pronto até', readyTs));
  }
  if (payload.notes) {
    out.push(repeat('-'));
    wrap(`Obs: ${payload.notes}`, COLS).forEach((l) => out.push(l));
  }

  // ---------- render HTML preservando colunas ----------
  const bodyHtml = out
    .map((raw) => {
      if (raw.startsWith('__BIG__')) {
        const txt = raw.slice('__BIG__'.length);
        const safe = escapeHtml(txt).replace(/ /g, '&nbsp;');
        return `<div class="ln big">${safe}</div>`;
      }
      if (raw.startsWith('__BOLD__')) {
        const txt = raw.slice('__BOLD__'.length);
        const safe = escapeHtml(txt).replace(/ /g, '&nbsp;');
        return `<div class="ln bold">${safe}</div>`;
      }
      const safe = escapeHtml(raw).replace(/ /g, '&nbsp;');
      return `<div class="ln">${safe || '&nbsp;'}</div>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${w} auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${w}; max-width: ${w};
      font-family: 'Courier New', 'Courier', monospace;
      font-size: 8.5pt;
      line-height: 0.95;
      color: #000;
      padding: 1mm 1mm;
      letter-spacing: 0;
    }
    .ln {
      white-space: pre;
      font-family: 'Courier New', 'Courier', monospace;
      font-size: 8.5pt;
      line-height: 0.95;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .bold { font-weight: bold; }
    .big { font-size: 13pt; font-weight: bold; line-height: 1.0; }
  </style></head><body>${bodyHtml}</body></html>`;
}

function buildReceiptHTMLForCompany(payload: PrintPayload): string {
  // Quando o caller informa explicitamente o layout, respeita a escolha do lojista.
  if (payload.printLayout === 'v3') return buildReceiptHTMLv3(payload);
  if (payload.printLayout === 'v1' || payload.printLayout === 'v2') return buildReceiptHTML(payload);
  // Compat legado: callers que ainda não passam printLayout caem no comportamento antigo
  // (I9 forçado em V3). Será removido quando todos os callers passarem o campo.
  if (payload.companyId === I9_COMPANY_ID_V3) return buildReceiptHTMLv3(payload);
  return buildReceiptHTML(payload);
}

function buildProductionHtml(payload: PrintPayload, ref: string) {
  // "Pronto até" na comanda de produção: ativo para todas as lojas com
  // layout V2 (cálculo: criação + máx. prazo estimado − 10 min, fallback 30).
  const showReady = payload.printLayout === 'v2' || !payload.printLayout;
  return generateProductionTicketHTML({
    tabNumber: payload.dailyNumber,
    customerName: payload.customerName,
    items: payload.items.map((i) => ({
      productName: i.name,
      quantity: i.quantity,
      notes: i.notes || null,
      groupedOptionals: i.groupedOptionals,
    })),
    createdAt: new Date(),
    paperSize: payload.paperSize || '80mm',
    referenceLabel: ref,
    companyId: payload.companyId,
    layout: payload.printLayout,
    deliveryAddress: payload.deliveryAddress || null,
    showReadyTime: showReady,
    readyOffsetMinutes: showReady
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
