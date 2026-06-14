// Utility for printing production tickets on 80mm thermal printers

export type PrintLayoutVersion = 'v1' | 'v2' | 'v3';

/** Tipo logístico do pedido — usado para destacar na comanda da cozinha. */
export type OrderTicketType = 'delivery' | 'pickup' | 'table' | 'counter';

interface PrintItem {
  productName: string;
  quantity: number;
  notes?: string | null;
  /** Optional product description. When provided, it is rendered below the
   *  product name in italic small text. When omitted (default), output is
   *  byte-for-byte identical to the previous behavior. */
  description?: string | null;
  /** Adicionais agrupados (V3, I9 rollout). Quando presente, o renderizador
   *  V3 exibe cada grupo com o rótulo em negrito (igual ao OrderCard).
   *  Formato: [{ groupName: "Sabores da sua Pizza", items: "CAMARÃO R$12,00, FILÉ R$8,00" }].
   *  Quando omitido, comportamento permanece idêntico ao anterior (parseNotes). */
  groupedOptionals?: { groupName: string; items: string }[];
}

interface PrintTicketData {
  tabNumber: number;
  tableNumber?: number;
  customerName?: string | null;
  items: PrintItem[];
  createdAt: Date;
  paperSize?: '58mm' | '80mm';
  referenceLabel?: string;
  layout?: PrintLayoutVersion;
  /** Quando true (layout v2), exibe data/hora de criação e previsão de pronto.
   *  Previsão = createdAt + readyOffsetMinutes. Para Lancheria I9 (prazo estimado 20–40 min),
   *  usar readyOffsetMinutes = 30 (máximo − 10 min). */
  showReadyTime?: boolean;
  readyOffsetMinutes?: number;
  /** Company atual. Usado para rollout isolado do título "PEDIDO <short_code>"
   *  em vez de "Comanda #<tabNumber>" — atualmente APENAS Lancheria I9. */
  companyId?: string;
  /** Quando informado, renderiza uma faixa de destaque (ENTREGA / RETIRADA /
   *  PEDIDO MESA / BALCÃO) logo abaixo do título "COMANDA DE PRODUÇÃO" para
   *  ajudar a logística da cozinha. Quando omitido, o layout permanece
   *  idêntico ao anterior. */
  orderType?: OrderTicketType;
  /** Endereço de entrega (I9 only). Quando presente, renderiza em bloco
   *  invertido (fundo preto, texto branco) igual ao nome do cliente.
   *  Emite marcador [ENDERECO]...[/ENDERECO] que o auto_printer.py >= v8.32
   *  interpreta. Em outras lojas: ignorado (sem regressão). */
  deliveryAddress?: string | null;
}

// Allow-list ISOLADA: troca de "Comanda #<n>" por referenceLabel no cabeçalho.
// Atualmente liberada APENAS para Lancheria da i9. Não alterar sem autorização.
const SHORT_CODE_HEADER_ALLOWLIST = new Set<string>([
  '8c9e7a0e-dbb6-49b9-8344-c23155a71164', // Lancheria da i9
  'a0071b86-6f2a-43f5-80d9-26e3ecd4b70c', // Margen Pizzaria
  '96e53bb2-2b71-4ed3-86cd-0f97858aca73', // Império do Açaí
]);

function shouldUseReferenceInHeader(data: PrintTicketData): boolean {
  return !!data.companyId && !!data.referenceLabel && SHORT_CODE_HEADER_ALLOWLIST.has(data.companyId);
}

function getPaperWidth(size?: '58mm' | '80mm'): string {
  return size === '80mm' ? '80mm' : '58mm';
}

function getTicketReferenceLabel(data: PrintTicketData): string {
  if (data.referenceLabel) return data.referenceLabel;
  if (data.tableNumber) return `MESA ${data.tableNumber}`;
  return `COMANDA #${data.tabNumber}`;
}

function getOrderTypeLabel(orderType?: OrderTicketType): string | null {
  switch (orderType) {
    case 'delivery': return 'ENTREGA';
    case 'pickup': return 'RETIRADA';
    case 'table': return 'PEDIDO MESA';
    case 'counter': return 'BALCÃO';
    default: return null;
  }
}

function renderOrderTypeBadgeHTML(orderType?: OrderTicketType): string {
  const label = getOrderTypeLabel(orderType);
  if (!label) return '';
  return `<div class="order-type-badge">&gt;&gt; ${label} &lt;&lt;</div>`;
}

/**
 * Splits notes string into "additionals" (lines starting with "Adicionais:")
 * and "observations" (everything else, e.g. customer notes).
 * Used by layout v2 to render them differently.
 */
function parseNotes(notes?: string | null): { additionals: string[]; observations: string[] } {
  const result = { additionals: [] as string[], observations: [] as string[] };
  if (!notes) return result;

  // notes may be joined with " | " from PedidoExpressDialog or come from menu as "Adicionais: a, b, c"
  const parts = notes.split('|').map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^Adicionais?:\s*(.+)$/i);
    if (match) {
      const items = match[1].split(',').map(s => s.trim()).filter(Boolean);
      result.additionals.push(...items);
    } else {
      result.observations.push(part);
    }
  }
  return result;
}

export function generateProductionTicketText(data: PrintTicketData): string {
  const now = data.createdAt;
  const dateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const timeStr = now.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  });

  const lines = [
    'COMANDA DE PRODUÇÃO',
    '',
    ...(getOrderTypeLabel(data.orderType) ? [`>> ${getOrderTypeLabel(data.orderType)} <<`, ''] : []),
    getTicketReferenceLabel(data),
    ...(data.customerName ? [data.customerName] : []),
    `${dateStr} às ${timeStr}`,
    '',
    ...data.items.flatMap((item) => [
      `${item.quantity}x ${item.productName}`,
      ...(item.notes ? [`→ ${item.notes}`] : []),
      ''
    ]),
    '--- FIM ---',
  ];

  return lines.join('\n').trim();
}

// ============================================================
// LAYOUT V1 — original (kept exactly as it was)
// ============================================================
function generateProductionTicketHTMLv1(data: PrintTicketData): string {
  const paperWidth = getPaperWidth(data.paperSize);
  const fontSize = data.paperSize === '80mm' ? '11pt' : '10pt';
  const qtyFontSize = data.paperSize === '80mm' ? '13pt' : '12pt';
  const nameFontSize = data.paperSize === '80mm' ? '12pt' : '11pt';
  const now = data.createdAt;
  const dateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const timeStr = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

  const itemsHTML = data.items.map(item => `
    <div class="item">
      <div class="item-header">
        <span class="qty">${item.quantity}x</span>
        <span class="name">${item.productName}</span>
      </div>
      ${item.description ? `<div class="description"><strong>Descrição:</strong> ${item.description}</div>` : ''}
      ${item.notes ? `<div class="notes">→ ${item.notes}</div>` : ''}
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Comanda de Produção</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Courier New', 'Lucida Console', monospace;
          width: ${paperWidth};
          max-width: ${paperWidth};
          padding: 2mm;
          font-size: ${fontSize};
          font-weight: bold;
          line-height: 1.3;
        }
        .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 2mm; margin-bottom: 2mm; }
        .title { font-size: 11pt; font-weight: bold; letter-spacing: 1px; }
        .info { font-size: 11pt; font-weight: bold; margin-top: 1mm; }
        .table-info { font-size: 14pt; font-weight: bold; background: #000; color: #fff; padding: 1mm 3mm; display: inline-block; margin-top: 1mm; }
        .datetime { font-size: 8pt; margin-top: 1mm; }
        .order-type-badge {
          font-size: 13pt;
          font-weight: 900;
          background: #000;
          color: #fff;
          padding: 1.5mm 2mm;
          margin: 1mm 0;
          letter-spacing: 1px;
          text-transform: uppercase;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .items { margin: 2mm 0; }
        .item { border-bottom: 1px dotted #000; padding: 1.5mm 0; }
        .item:last-child { border-bottom: none; }
        .item-header { display: flex; align-items: baseline; gap: 1mm; }
        .qty { font-size: ${qtyFontSize}; font-weight: bold; min-width: 8mm; }
        .name { font-size: ${nameFontSize}; font-weight: bold; flex: 1; word-break: break-word; text-transform: uppercase; }
        .notes { font-size: 9pt; font-style: italic; margin-left: 8mm; margin-top: 0.5mm; }
        .description { font-size: 9pt; font-style: italic; font-weight: normal; margin-left: 8mm; margin-top: 0.5mm; }
        .footer { border-top: 1px dashed #000; padding-top: 2mm; margin-top: 2mm; text-align: center; font-size: 8pt; }
        @media print {
          body { width: ${paperWidth}; }
          @page { margin: 0; size: ${paperWidth} auto; }
        }
      </style>
    </head>
    <body>
      <!--BOX_START-->
      <div class="header">
        <div class="title">COMANDA DE PRODUÇÃO</div>
        ${renderOrderTypeBadgeHTML(data.orderType)}
        <div class="info">${shouldUseReferenceInHeader(data) ? getTicketReferenceLabel(data) : `Comanda #${data.tabNumber}`}</div>
        ${data.tableNumber ? `<div class="table-info">MESA ${data.tableNumber}</div>` : ''}
        ${data.customerName ? `<div class="info">[CLIENTE]${data.customerName}[/CLIENTE]</div>` : ''}
        <div class="datetime">${dateStr} às ${timeStr}</div>
      </div>
      <!--BOX_END-->
      <div class="items">${itemsHTML}</div>
      <div class="footer">--- FIM ---</div>
    </body>
    </html>
  `;
}

// ============================================================
// LAYOUT V2 — adicionais empilhados em negrito + observações invertidas
// ============================================================
function generateProductionTicketHTMLv2(data: PrintTicketData): string {
  const paperWidth = getPaperWidth(data.paperSize);
  const fontSize = data.paperSize === '80mm' ? '11pt' : '10pt';
  const qtyFontSize = data.paperSize === '80mm' ? '13pt' : '12pt';
  const nameFontSize = data.paperSize === '80mm' ? '12pt' : '11pt';
  const addFontSize = data.paperSize === '80mm' ? '13pt' : '12pt';
  const obsFontSize = data.paperSize === '80mm' ? '12pt' : '11pt';
  // Modo compacto V2 (economia de papel) — rollout isolado: Lancheria da i9.
  // Reduz line-height, margens e paddings SEM mexer no tamanho da fonte.
  // Mantém separadores (.item-sep) e estrutura intactos.
  const I9_COMPANY_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';
  const compact = data.companyId === I9_COMPANY_ID;
  const bodyLH = compact ? '1.15' : '1.3';
  const itemPad = compact ? '0.8mm 0' : '1.5mm 0';
  const addLH = compact ? '1.2' : '1.5';
  const addMargin = compact ? '0.8mm 0 0 4mm' : '1.5mm 0 0 4mm';
  const obsBlockMargin = compact ? '1mm 0 0 4mm' : '2mm 0 0 4mm';
  const obsPad = compact ? '0.8mm 2mm' : '1.5mm 3mm';
  const headerPadBottom = compact ? '1mm' : '2mm';
  const headerMarginBottom = compact ? '1mm' : '2mm';
  const footerPadTop = compact ? '1mm' : '2mm';
  const footerMarginTop = compact ? '1mm' : '2mm';
  const now = data.createdAt;
  const dateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const timeStr = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

  // Previsão de pronto (apenas quando solicitado, ex.: Lancheria I9)
  const readyOffset = typeof data.readyOffsetMinutes === 'number' ? data.readyOffsetMinutes : 10;
  const readyDate = new Date(now.getTime() + readyOffset * 60 * 1000);
  const readyDateStr = readyDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const readyTimeStr = readyDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  // I9 (V2): remove "Criado em" redundante e mostra "Pronto até" logo abaixo
  // da data/hora do cabeçalho. Demais lojas: bloco vazio (sem alteração).
  const readyBlockHTML = '';
  const readyHeaderHTML = data.showReadyTime
    ? `<div class="datetime ready-inline"><strong>Pronto até:</strong> ${readyTimeStr}</div>`
    : '';

  const itemsHTML = data.items.map((item, index) => {
    const { additionals, observations } = parseNotes(item.notes);
    // V2: quando o caller forneceu grupos estruturados, exibir o nome
    // do grupo em negrito antes dos itens. Fallback (sem groupedOptionals):
    // mantém o comportamento original V2 (lista plana ">> item").
    const groupedV2 =
      data.layout === 'v2' &&
      item.groupedOptionals &&
      item.groupedOptionals.length > 0;
    // I9 v8.32+:
    //  - 1 grupo: esconde o rótulo, só lista "+ ITEM"
    //  - 2+ grupos: emite [ADDGROUP_LABEL]Nome[/ADDGROUP_LABEL] (■ + sublinhado + sem CAPS)
    //  - itens sempre via <div class="add-line"> → Python converte em [ADD] (+ CAPS).
    const additionalsHTML = groupedV2
      ? `<div class="additionals">${item.groupedOptionals!
          .map((g) => {
            const itensHtml = g.items
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((it) => `<div class="add-line">&gt;&gt; ${it}</div>`)
              .join('');
            const single = item.groupedOptionals!.length === 1;
            const labelHtml = single
              ? ''
              : `<div class="add-group-label">[ADDGROUP_LABEL]${g.groupName}[/ADDGROUP_LABEL]</div>`;
            return labelHtml + itensHtml;
          })
          .join('')}</div>`
      : additionals.length > 0
        ? `<div class="additionals">${additionals.map(a => `<div class="add-line">&gt;&gt; ${a}</div>`).join('')}</div>`
        : '';
    const observationsHTML = observations.length > 0
      ? `<div class="obs-block">${observations.map(o => `<div class="obs"><span class="obs-text">${o}</span></div>`).join('')}</div>`
      : '';
    const descriptionHTML = item.description
      ? `<div class="description"><strong>Descrição:</strong> ${item.description}</div>`
      : '';
    const separatorHTML = index < data.items.length - 1 ? '<div class="item-sep">................................</div>' : '';
    return `
      <div class="item">
        <div class="item-header">
          <span class="qty">${item.quantity}x</span>
          <span class="name">${item.productName}</span>
        </div>
        ${descriptionHTML}
        ${additionalsHTML}
        ${observationsHTML}
      </div>
      ${separatorHTML}
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Comanda de Produção (v2)</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body {
          font-family: 'Courier New', 'Lucida Console', monospace;
          width: ${paperWidth};
          max-width: ${paperWidth};
          padding: 2mm;
          font-size: ${fontSize};
          font-weight: bold;
          line-height: ${bodyLH};
        }
        .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: ${headerPadBottom}; margin-bottom: ${headerMarginBottom}; }
        .title { font-size: 11pt; font-weight: bold; letter-spacing: 1px; }
        .info { font-size: 11pt; font-weight: bold; margin-top: 1mm; }
        .table-info { font-size: 14pt; font-weight: bold; border: 2px solid #000; padding: 1mm 3mm; display: inline-block; margin-top: 1mm; }
        .datetime { font-size: 8pt; margin-top: 1mm; }
        .order-type-badge {
          font-size: 13pt;
          font-weight: 900;
          background: #000 !important;
          background-color: #000 !important;
          color: #fff !important;
          padding: 1.5mm 2mm;
          margin: 1mm 0;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .items { margin: 2mm 0; }
        .item { border-bottom: 1px dotted #000; padding: ${itemPad}; }
        .item:last-child { border-bottom: none; }
        .item-sep { font-size: 10pt; line-height: 1; margin: 1mm 0; letter-spacing: 0; }
        .item-header { display: flex; align-items: baseline; gap: 1mm; }
        .qty { font-size: ${qtyFontSize}; font-weight: bold; min-width: 8mm; }
        .name { font-size: ${nameFontSize}; font-weight: 400; flex: 1; word-break: break-word; text-transform: uppercase; }

        /* V2: adicionais empilhados destacados com >> e fonte maior */
        .additionals { margin: ${addMargin}; }
        /* V2 (I9): rótulo do grupo de adicionais, exibido acima dos itens do grupo. */
        .add-group-label {
          font-size: ${obsFontSize};
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: 1mm;
          text-decoration: underline;
        }
        .add-line {
          font-size: ${addFontSize};
          font-weight: 900;
          line-height: ${addLH};
          word-break: break-word;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          -webkit-text-stroke: 0.5px #000;
        }

        /* V2: descrição do produto (opcional, ativada por categoria) */
        .description { font-size: 9pt; font-style: italic; font-weight: normal; margin: 0.5mm 0 0 4mm; line-height: 1.3; }

        /* V2: observação com fundo preto sólido (forçado para impressão) */
        .obs-block { margin: ${obsBlockMargin}; }
        .obs {
          display: block;
          background: #000 !important;
          background-color: #000 !important;
          padding: ${obsPad};
          margin-bottom: 1mm;
        }
        .obs-text {
          color: #fff !important;
          font-weight: 900;
          font-size: ${obsFontSize};
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* V2: footer compactado — sem border-top (os traços do texto já servem
           de separador), reduzindo de 2 linhas visuais para 1. */
        .footer { padding-top: 0; margin-top: ${footerMarginTop}; text-align: center; font-size: 8pt; line-height: 1; }

        /* V2: bloco de previsão de pronto (Lancheria I9) */
        .ready-block { border: 1px dashed #000; padding: 1.5mm 2mm; margin: 2mm 0; text-align: center; }
        .ready-line { font-size: 10pt; font-weight: bold; line-height: 1.4; }
        .ready-highlight { font-size: 12pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 0.5mm; }
        /* V2 (I9): "Pronto até" inline no cabeçalho, logo abaixo da data/hora. */
        .ready-inline { font-size: 11pt; font-weight: 900; margin-top: 0.5mm; text-transform: uppercase; letter-spacing: 0.3px; }
        @media print {
          html, body, * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body { width: ${paperWidth}; }
          @page { margin: 0; size: ${paperWidth} auto; }
          .obs { background: #000 !important; background-color: #000 !important; }
          .obs-text { color: #fff !important; }
          .add-line { -webkit-text-stroke: 0.5px #000 !important; }
          .order-type-badge { background: #000 !important; background-color: #000 !important; color: #fff !important; }
        }
      </style>
    </head>
    <body>
      <!--BOX_START-->
      <div class="header">
        <div class="title">COMANDA DE PRODUÇÃO</div>
        ${renderOrderTypeBadgeHTML(data.orderType)}
        <div class="info">${shouldUseReferenceInHeader(data) ? getTicketReferenceLabel(data) : `Comanda #${data.tabNumber}`}</div>
        ${data.tableNumber ? `<div class="table-info">MESA ${data.tableNumber}</div>` : ''}
        ${data.customerName ? `<div class="info">[CLIENTE]${data.customerName}[/CLIENTE]</div>` : ''}
        <div class="datetime">${dateStr} às ${timeStr}</div>
        ${readyHeaderHTML}
        ${data.deliveryAddress && data.layout === 'v2' ? `<div class="info">[ENDERECO]${data.deliveryAddress}[/ENDERECO]</div>` : ''}
      </div>
      <!--BOX_END-->
      ${readyBlockHTML}
      <div class="items">${itemsHTML}</div>
      <div class="footer">--- FIM ---</div>
    </body>
    </html>
  `;
}

// ============================================================
// LAYOUT V3 — dense monospace, big PED header, ASCII separators
// Inspirado no recibo V3 (I9). NÃO altera V1/V2.
// ============================================================
function generateProductionTicketHTMLv3(data: PrintTicketData): string {
  const paperWidth = getPaperWidth(data.paperSize);
  const baseSize = data.paperSize === '80mm' ? '12pt' : '11pt';
  const pedSize = data.paperSize === '80mm' ? '26pt' : '22pt';
  const qtySize = data.paperSize === '80mm' ? '15pt' : '13pt';
  const nameSize = data.paperSize === '80mm' ? '13pt' : '12pt';
  const addSize = data.paperSize === '80mm' ? '13pt' : '12pt';
  const obsSize = data.paperSize === '80mm' ? '12pt' : '11pt';

  const now = data.createdAt;
  const dateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const timeStr = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

  const readyOffset = typeof data.readyOffsetMinutes === 'number' ? data.readyOffsetMinutes : 10;
  const readyDate = new Date(now.getTime() + readyOffset * 60 * 1000);
  const readyTimeStr = readyDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const readyBlockHTML = data.showReadyTime
    ? `<div class="ready-v3"><strong>PRONTO ATÉ:</strong> ${readyTimeStr}</div>`
    : '';

  const orderTypeLabel = getOrderTypeLabel(data.orderType);
  const orderTypeHTML = orderTypeLabel
    ? `<div class="type-v3">&gt;&gt;&gt; ${orderTypeLabel} &lt;&lt;&lt;</div>`
    : '';

  const refLabel = shouldUseReferenceInHeader(data)
    ? getTicketReferenceLabel(data)
    : `COMANDA #${data.tabNumber}`;

  const itemsHTML = data.items.map((item, index) => {
    const { additionals, observations } = parseNotes(item.notes);
    // V3 (I9): se o caller forneceu grupos, renderiza "Grupo: itens" com rótulo
    // em negrito (mesmo formato do OrderCard). Fallback: lista plana antiga.
    const groups = item.groupedOptionals && item.groupedOptionals.length > 0
      ? item.groupedOptionals
      : null;
    const additionalsHTML = groups
      ? `<div class="adds-v3">${groups
          .map(
            (g) =>
              `<div class="grp-v3"><span class="grp-label-v3">${g.groupName}:</span> ${g.items}</div>`
          )
          .join('')}</div>`
      : additionals.length > 0
      ? `<div class="adds-v3">${additionals.map(a => `<div class="add-v3">+ ${a}</div>`).join('')}</div>`
      : '';
    const observationsHTML = observations.length > 0
      ? `<div class="obs-v3-block">${observations.map(o => `<div class="obs-v3">! ${o}</div>`).join('')}</div>`
      : '';
    const descriptionHTML = item.description
      ? `<div class="desc-v3">${item.description}</div>`
      : '';
    const sep = index < data.items.length - 1 ? '<div class="sep-v3">- - - - - - - - - - - - - - - -</div>' : '';
    return `
      <div class="item-v3">
        <div class="item-head-v3">
          <span class="qty-v3">${item.quantity}x</span>
          <span class="name-v3">${item.productName}</span>
        </div>
        ${descriptionHTML}
        ${additionalsHTML}
        ${observationsHTML}
      </div>
      ${sep}
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Comanda de Produção (v3)</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body {
          font-family: 'Courier New', 'Lucida Console', monospace;
          width: ${paperWidth};
          max-width: ${paperWidth};
          padding: 2mm;
          font-size: ${baseSize};
          line-height: 1.2;
          color: #000;
        }
        .title-v3 { text-align:center; font-weight:900; font-size:14pt; letter-spacing:2px; }
        .type-v3 {
          text-align:center; font-weight:900; font-size:13pt;
          background:#000 !important; color:#fff !important;
          padding:1.5mm 2mm; margin:1.5mm 0; letter-spacing:1px;
        }
        .ped-v3 {
          text-align:center; font-weight:900; font-size:${pedSize};
          letter-spacing:3px; margin:1mm 0;
        }
        .info-v3 { text-align:center; font-size:10pt; font-weight:bold; }
        .datetime-v3 { text-align:center; font-size:9pt; margin:0.5mm 0 1.5mm 0; }
        .ready-v3 {
          border:2px solid #000; padding:1.5mm 2mm; margin:1.5mm 0;
          text-align:center; font-size:12pt; font-weight:900; letter-spacing:1px;
        }
        .frame-sep { text-align:center; font-size:10pt; letter-spacing:0; margin:1mm 0; }
        .items-v3 { margin:1mm 0; }
        .item-v3 { padding:1mm 0; }
        .item-head-v3 { display:flex; gap:2mm; align-items:baseline; }
        .qty-v3 { font-size:${qtySize}; font-weight:900; min-width:9mm; }
        .name-v3 { font-size:${nameSize}; font-weight:900; text-transform:uppercase; flex:1; word-break:break-word; }
        .desc-v3 { font-size:9pt; font-style:italic; margin:0.5mm 0 0 9mm; }
        .adds-v3 { margin:1mm 0 0 9mm; }
        .add-v3 {
          font-size:${addSize}; font-weight:900; text-transform:uppercase;
          line-height:1.4; letter-spacing:0.5px;
        }
        .grp-v3 {
          font-size:${addSize}; font-weight:700;
          line-height:1.35; letter-spacing:0.2px;
          margin-bottom:0.5mm; word-break:break-word;
        }
        .grp-label-v3 { font-weight:900; text-transform:uppercase; }
        .obs-v3-block { margin:1.5mm 0 0 9mm; }
        .obs-v3 {
          background:#000 !important; color:#fff !important;
          padding:1mm 2mm; margin:0.5mm 0;
          font-weight:900; font-size:${obsSize};
          text-transform:uppercase; letter-spacing:0.3px;
        }
        .sep-v3 { text-align:center; font-size:9pt; margin:1mm 0; letter-spacing:0; }
        .foot-v3 { text-align:center; font-size:9pt; margin-top:2mm; font-weight:bold; }
        @media print {
          html, body, * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body { width: ${paperWidth}; }
          @page { margin: 0; size: ${paperWidth} auto; }
          .type-v3, .obs-v3 { background:#000 !important; color:#fff !important; }
        }
      </style>
    </head>
    <body>
      <!--BOX_START-->
      <div class="title-v3">COMANDA DE PRODUÇÃO</div>
      ${orderTypeHTML}
      <div class="frame-sep">================================</div>
      <div class="ped-v3">${refLabel}</div>
      ${data.tableNumber ? `<div class="info-v3">MESA ${data.tableNumber}</div>` : ''}
      ${data.customerName ? `<div class="info-v3">[CLIENTE]${data.customerName}[/CLIENTE]</div>` : ''}
      <div class="datetime-v3">${dateStr} ${timeStr}</div>
      ${readyBlockHTML}
      <div class="frame-sep">================================</div>
      <!--BOX_END-->
      <div class="items-v3">${itemsHTML}</div>
      <div class="frame-sep">================================</div>
      <div class="foot-v3">--- FIM ---</div>
    </body>
    </html>
  `;
}

export function generateProductionTicketHTML(data: PrintTicketData): string {
  const layout = data.layout || 'v1';
  if (layout === 'v3') return generateProductionTicketHTMLv3(data);
  if (layout === 'v2') return generateProductionTicketHTMLv2(data);
  return generateProductionTicketHTMLv1(data);
}

export function printProductionTicket(data: PrintTicketData): void {
  const html = generateProductionTicketHTML(data);

  // Use hidden iframe to avoid popup blockers on mobile
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.print();
    } catch {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.onload = () => { w.print(); w.close(); };
      }
    }
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  };

  if (iframe.contentWindow) {
    iframe.contentWindow.onafterprint = () => {
      document.body.removeChild(iframe);
    };
  }

  setTimeout(triggerPrint, 300);
}
