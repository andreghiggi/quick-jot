// Utility for printing production tickets on 80mm thermal printers

interface PrintItem {
  productName: string;
  quantity: number;
  notes?: string | null;
}

interface PrintTicketData {
  tabNumber: number;
  tableNumber?: number;
  customerName?: string | null;
  items: PrintItem[];
  createdAt: Date;
  paperSize?: '58mm' | '80mm';
}

function getPaperWidth(size?: '58mm' | '80mm'): string {
  return size === '80mm' ? '80mm' : '58mm';
}

export function generateProductionTicketHTML(data: PrintTicketData): string {
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
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Courier New', 'Lucida Console', monospace;
          width: ${paperWidth};
          max-width: ${paperWidth};
          padding: 2mm;
          font-size: ${fontSize};
          font-weight: bold;
          line-height: 1.3;
        }
        .header {
          text-align: center;
          border-bottom: 1px dashed #000;
          padding-bottom: 2mm;
          margin-bottom: 2mm;
        }
        .title {
          font-size: 11pt;
          font-weight: bold;
          letter-spacing: 1px;
        }
        .info {
          font-size: 11pt;
          font-weight: bold;
          margin-top: 1mm;
        }
        .table-info {
          font-size: 14pt;
          font-weight: bold;
          background: #000;
          color: #fff;
          padding: 1mm 3mm;
          display: inline-block;
          margin-top: 1mm;
        }
        .datetime {
          font-size: 8pt;
          margin-top: 1mm;
        }
        .items {
          margin: 2mm 0;
        }
        .item {
          border-bottom: 1px dotted #000;
          padding: 1.5mm 0;
        }
        .item:last-child {
          border-bottom: none;
        }
        .item-header {
          display: flex;
          align-items: baseline;
          gap: 1mm;
        }
        .qty {
          font-size: ${qtyFontSize};
          font-weight: bold;
          min-width: 8mm;
        }
        .name {
          font-size: ${nameFontSize};
          font-weight: bold;
          flex: 1;
          word-break: break-word;
          text-transform: uppercase;
        }
        .notes {
          font-size: 9pt;
          font-style: italic;
          margin-left: 8mm;
          margin-top: 0.5mm;
        }
        .footer {
          border-top: 1px dashed #000;
          padding-top: 2mm;
          margin-top: 2mm;
          text-align: center;
          font-size: 8pt;
        }
        @media print {
          body {
            width: ${paperWidth};
          }
          @page {
            margin: 0;
            size: ${paperWidth} auto;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">COMANDA DE PRODUÇÃO</div>
        <div class="info">Comanda #${data.tabNumber}</div>
        ${data.tableNumber ? `<div class="table-info">MESA ${data.tableNumber}</div>` : ''}
        ${data.customerName ? `<div class="info">${data.customerName}</div>` : ''}
        <div class="datetime">${dateStr} às ${timeStr}</div>
      </div>
      
      <div class="items">
        ${itemsHTML}
      </div>
      
      <div class="footer">
        --- FIM DO PEDIDO ---
      </div>
    </body>
    </html>
  `;
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
      // fallback: open in new tab
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
