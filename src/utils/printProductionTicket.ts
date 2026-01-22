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
}

export function generateProductionTicketHTML(data: PrintTicketData): string {
  const now = data.createdAt;
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
          font-family: 'Courier New', monospace;
          width: 80mm;
          max-width: 80mm;
          padding: 2mm;
          font-size: 12pt;
        }
        .header {
          text-align: center;
          border-bottom: 2px dashed #000;
          padding-bottom: 3mm;
          margin-bottom: 3mm;
        }
        .title {
          font-size: 16pt;
          font-weight: bold;
          letter-spacing: 1px;
        }
        .info {
          font-size: 14pt;
          font-weight: bold;
          margin-top: 2mm;
        }
        .table-info {
          font-size: 18pt;
          font-weight: bold;
          background: #000;
          color: #fff;
          padding: 2mm 4mm;
          display: inline-block;
          margin-top: 2mm;
        }
        .datetime {
          font-size: 10pt;
          margin-top: 2mm;
        }
        .items {
          margin: 3mm 0;
        }
        .item {
          border-bottom: 1px dotted #000;
          padding: 2mm 0;
        }
        .item:last-child {
          border-bottom: none;
        }
        .item-header {
          display: flex;
          align-items: baseline;
          gap: 2mm;
        }
        .qty {
          font-size: 16pt;
          font-weight: bold;
          min-width: 10mm;
        }
        .name {
          font-size: 14pt;
          font-weight: bold;
          flex: 1;
          word-break: break-word;
        }
        .notes {
          font-size: 11pt;
          font-style: italic;
          margin-left: 12mm;
          margin-top: 1mm;
          color: #333;
        }
        .footer {
          border-top: 2px dashed #000;
          padding-top: 3mm;
          margin-top: 3mm;
          text-align: center;
          font-size: 10pt;
        }
        @media print {
          body {
            width: 80mm;
          }
          @page {
            margin: 0;
            size: 80mm auto;
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
  
  const printWindow = window.open('', '_blank', 'width=320,height=600');
  if (!printWindow) {
    alert('Popup bloqueado! Permita popups para imprimir.');
    return;
  }
  
  printWindow.document.write(html);
  printWindow.document.close();
  
  // Wait for content to load then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };
}
