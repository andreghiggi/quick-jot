import { enqueueReceiptJob } from '@/utils/printRouting';

// Expand only after physical validation and explicit user authorization.
export const NON_FISCAL_PRINT_PILOTS: ReadonlySet<string> = new Set([
  '8c9e7a0e-dbb6-49b9-8344-c23155a71164', // Lancheria da I9
]);

export interface NonFiscalReceipt {
  companyId: string;
  saleId: string;
  storeName: string;
  customerName?: string;
  paperSize: '58mm' | '80mm';
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  discount: number;
  surcharge: number;
  total: number;
  payments: Array<{ name: string; amount: number }>;
  issuedAt: Date;
}

const esc = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char] || char);
const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

export function buildNonFiscalReceipt(payload: NonFiscalReceipt): string {
  const row = (label: string, value: string) => `<div class="row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    :root { --receipt-ink: #000; --receipt-paper: #fff; }
    @page { size: ${payload.paperSize} auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body { width: ${payload.paperSize}; margin: 0; padding: 4px; color: var(--receipt-ink); background: var(--receipt-paper); font: 12px monospace; }
    .center { text-align: center; } .row { display: flex; justify-content: space-between; gap: 6px; }
    .row span { overflow-wrap: anywhere; } hr { border: 0; border-top: 1px dashed var(--receipt-ink); }
  </style></head><body><h3 class="center">${esc(payload.storeName)}</h3>
    <div class="center"><strong>COMPROVANTE DE VENDA</strong><br>NÃO É DOCUMENTO FISCAL</div>
    <div>${esc(payload.issuedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</div>
    <div>Venda #${esc(payload.saleId.slice(0, 6).toUpperCase())}</div>
    ${payload.customerName ? `<div>Cliente: ${esc(payload.customerName)}</div>` : ''}<hr>
    ${payload.items.map(item => row(`${item.quantity.toLocaleString('pt-BR')}x ${item.name}`, money(item.quantity * item.unitPrice))).join('')}
    <hr>${payload.discount > 0 ? row('Desconto', money(payload.discount)) : ''}
    ${payload.surcharge > 0 ? row('Acréscimo', money(payload.surcharge)) : ''}${row('TOTAL', money(payload.total))}<hr>
    ${payload.payments.map(payment => row(payment.name, money(payment.amount))).join('')}
  </body></html>`;
}

export function nonFiscalPrintAction(companyId: string, fiscalMode: string, mode: string, creditSale = false): 'auto' | 'ask' | null {
  if (!NON_FISCAL_PRINT_PILOTS.has(companyId) || fiscalMode !== 'nao_fiscal' || creditSale) return null;
  return mode === 'auto' || mode === 'ask' ? mode : null;
}

export async function printNonFiscalSale(receipt: NonFiscalReceipt): Promise<void> {
  await enqueueReceiptJob({ companyId: receipt.companyId, sourceOrderId: receipt.saleId,
    label: `Venda #${receipt.saleId.slice(0, 6).toUpperCase()} — não fiscal`, html: buildNonFiscalReceipt(receipt) });
}