/**
 * Comprovante de Recebimento de Crediário (não fiscal).
 *
 * Imprime UMA via por parcela recebida no fluxo de "Efetivar receita"
 * (Financeiro → Receitas). Documento simples com dados da loja, cliente,
 * parcela, valor recebido, formas de pagamento e saldo restante do
 * título (0 quando quita).
 *
 * NÃO substitui o comprovante gerado pelo Frente de Caixa no momento da
 * venda do crediário (`crediarioReceiptPrint.ts`) — este documento é
 * emitido a cada recebimento de parcela.
 */

export interface PaymentReceiptPayment {
  paymentName: string;
  amount: number;
}

export interface PaymentReceiptPayload {
  paperSize: '58mm' | '80mm';
  storeName: string;
  storeCnpj?: string | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  operatorName?: string | null;
  customerName: string;
  customerDocument?: string | null;
  documentNumber?: string | null;
  installmentLabel?: string | null;
  amountPaid: number;
  interest?: number;
  fine?: number;
  discount?: number;
  surcharge?: number;
  remainingBalance: number;
  status: 'paid' | 'partial';
  payments: PaymentReceiptPayment[];
  issuedAt: Date;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

function money(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function fmtDateTime(dt: Date) {
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function buildHTML(p: PaymentReceiptPayload): string {
  const width = p.paperSize === '80mm' ? '80mm' : '58mm';
  const fontSize = p.paperSize === '80mm' ? '10px' : '9px';
  const paymentsRows = p.payments.map((pay) => `
    <div class="row"><span>${esc(pay.paymentName)}</span><span>${money(pay.amount)}</span></div>
  `).join('');
  const adj: string[] = [];
  if (p.interest && p.interest > 0) adj.push(`<div class="row"><span>Juros</span><span>+ ${money(p.interest)}</span></div>`);
  if (p.fine && p.fine > 0) adj.push(`<div class="row"><span>Multa</span><span>+ ${money(p.fine)}</span></div>`);
  if (p.surcharge && p.surcharge > 0) adj.push(`<div class="row"><span>Acréscimo</span><span>+ ${money(p.surcharge)}</span></div>`);
  if (p.discount && p.discount > 0) adj.push(`<div class="row"><span>Desconto</span><span>- ${money(p.discount)}</span></div>`);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { size: ${width} auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: ${fontSize}; margin: 0; padding: 4px; width: ${width}; color: #000; line-height: 1.3; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .small { font-size: ${p.paperSize === '80mm' ? '9px' : '8px'}; }
  .separator { border-top: 1px dashed #000; margin: 3px 0; height: 0; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .banner { border: 1px solid #000; padding: 3px; margin: 3px 0; text-align: center; font-weight: 700; text-transform: uppercase; }
  .total-row { display: flex; justify-content: space-between; font-weight: 700; font-size: ${p.paperSize === '80mm' ? '13px' : '11px'}; margin: 2px 0; }
  .sig { margin-top: 22px; border-top: 1px solid #000; text-align: center; padding-top: 2px; }
</style></head>
<body>
  <div class="center bold">${esc(p.storeName)}</div>
  ${p.storeCnpj ? `<div class="center small">CNPJ: ${esc(p.storeCnpj)}</div>` : ''}
  ${p.storeAddress ? `<div class="center small">${esc(p.storeAddress)}</div>` : ''}
  ${p.storePhone ? `<div class="center small">Tel: ${esc(p.storePhone)}</div>` : ''}

  <div class="banner">Comprovante de Recebimento<br/>Não é documento fiscal</div>

  <div><span class="bold">Cliente:</span> ${esc(p.customerName)}</div>
  ${p.customerDocument ? `<div>CPF/CNPJ: ${esc(p.customerDocument)}</div>` : ''}

  <div class="separator"></div>
  ${p.documentNumber ? `<div class="row"><span>Documento</span><span>${esc(p.documentNumber)}</span></div>` : ''}
  ${p.installmentLabel ? `<div class="row"><span>Parcela</span><span>${esc(p.installmentLabel)}</span></div>` : ''}
  <div class="row"><span>Emissão</span><span>${fmtDateTime(p.issuedAt)}</span></div>
  ${p.operatorName ? `<div class="row small"><span>Operador</span><span>${esc(p.operatorName)}</span></div>` : ''}

  ${adj.length ? `<div class="separator"></div>${adj.join('')}` : ''}

  <div class="separator"></div>
  <div class="bold">Formas de pagamento</div>
  ${paymentsRows || '<div class="small">—</div>'}

  <div class="separator"></div>
  <div class="total-row"><span>VALOR RECEBIDO</span><span>${money(p.amountPaid).replace('R$ ', '')}</span></div>
  <div class="row"><span>Saldo restante do título</span><span>${money(p.remainingBalance)}</span></div>
  <div class="row bold"><span>Status</span><span>${p.status === 'paid' ? 'QUITADO' : 'PARCIAL'}</span></div>

  <div class="separator"></div>
  <div class="sig">Assinatura do recebedor</div>
</body></html>`;
}

export async function printPaymentReceipt(payload: PaymentReceiptPayload): Promise<void> {
  const html = buildHTML(payload);
  const printWindow = window.open('', '_blank', 'width=420,height=750');
  if (!printWindow) {
    throw new Error('Pop-up bloqueado. Permita pop-ups para imprimir o comprovante.');
  }
  const withAutoPrint = html.replace(
    '</body>',
    `<div class="no-print" style="text-align:center;margin-top:12px;">
       <button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;">🖨️ Imprimir</button>
     </div>
     <style>@media print { .no-print { display:none !important; } }</style>
     </body>`,
  );
  printWindow.document.open();
  printWindow.document.write(withAutoPrint);
  printWindow.document.close();
  await new Promise((r) => setTimeout(r, 400));
  try { printWindow.print(); } catch (_) { /* noop */ }
}