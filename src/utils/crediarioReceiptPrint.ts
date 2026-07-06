/**
 * Comprovante de Crediário (não fiscal) — Frente de Caixa.
 *
 * Gera um HTML no formato 58/80mm (mesmo padrão dos recibos do PDV) com:
 *   - Cabeçalho da loja
 *   - Itens da venda
 *   - Totais
 *   - Lista das parcelas (nº / vencimento / valor)
 *   - Termo curto: "Li e estou de acordo com este documento."
 *   - Campo de assinatura + CPF do cliente
 *
 * Abre a janela de impressão do navegador (mesmo comportamento do DANFE
 * NFC-e) respeitando o número de vias configurado em
 * `pdv_settings.crediario_receipt_copies` (1 ou 2). O operador confirma
 * a impressão pelo diálogo do Chrome — não é enviado para o
 * `auto_printer.py`.
 *
 * Escopo: usado APENAS pelo fluxo de crediário do Frente de Caixa. Não
 * afeta impressão de cupom fiscal, DANFE NFC-e ou recibos do PDV V2.
 */
// Sem import do supabase — a impressão é 100% client-side (window.open + print).

export interface CrediarioReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
}

export interface CrediarioReceiptPayload {
  companyId: string;
  paperSize: '58mm' | '80mm';
  copies: 1 | 2;
  storeName: string;
  storeCnpj?: string | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  saleNumber: number | string | null;
  operatorName?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerDocument?: string | null;
  items: CrediarioReceiptItem[];
  subtotal: number;
  discount: number;
  surcharge: number;
  total: number;
  installments: { number: number; dueDate: string; amount: number }[];
  notes?: string | null;
  city?: string | null;
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

function fmtDate(iso: string) {
  // 'YYYY-MM-DD' → 'DD/MM/YYYY'
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function fmtDateTime(dt: Date) {
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function buildHTML(p: CrediarioReceiptPayload): string {
  const width = p.paperSize === '80mm' ? '80mm' : '58mm';
  const fontSize = p.paperSize === '80mm' ? '10px' : '9px';

  const qtdFmt = (q: number) => Number.isInteger(q) ? String(q) : q.toFixed(3).replace('.', ',');

  const itemsRows = p.items.map((it, idx) => {
    const total = it.quantity * it.unit_price;
    return `
      <tr>
        <td class="col-idx">${String(idx + 1).padStart(3, '0')}</td>
        <td class="col-desc">${esc(it.name)}</td>
        <td class="col-num">${qtdFmt(it.quantity)}</td>
        <td class="col-num">${money(it.unit_price)}</td>
        <td class="col-num">${money(total)}</td>
      </tr>`;
  }).join('');

  const parcelasRows = p.installments.map((i) => `
      <tr>
        <td class="col-desc">${String(i.number).padStart(2, '0')}/${String(p.installments.length).padStart(2, '0')} — ${fmtDate(i.dueDate)}</td>
        <td class="col-num">${money(i.amount)}</td>
      </tr>`).join('');

  const cityLabel = p.city ? `${esc(p.city)}, ` : '';
  const docLine = p.customerDocument ? `CPF/CNPJ: ${esc(p.customerDocument)}` : 'CPF: ______________________';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { size: ${width} auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: ${fontSize}; margin: 0; padding: 4px; width: ${width}; color: #000; line-height: 1.25; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .small { font-size: ${p.paperSize === '80mm' ? '9px' : '8px'}; }
  .title { font-weight: 700; text-transform: uppercase; font-size: ${p.paperSize === '80mm' ? '11px' : '10px'}; }
  .separator { border-top: 1px dashed #000; margin: 3px 0; height: 0; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .total-row { display: flex; justify-content: space-between; font-weight: 700; font-size: ${p.paperSize === '80mm' ? '14px' : '12px'}; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: ${p.paperSize === '80mm' ? '9px' : '8px'}; }
  th, td { padding: 1px 2px; vertical-align: top; text-align: left; }
  th { border-bottom: 1px dashed #000; font-weight: 700; text-transform: uppercase; }
  .col-idx { width: 22px; }
  .col-desc { word-break: break-word; }
  .col-num { text-align: right; white-space: nowrap; }
  .homolog-warn { border: 1px solid #000; padding: 3px; margin: 3px 0; text-align: center; font-weight: 700; font-size: ${p.paperSize === '80mm' ? '9px' : '8px'}; }
  .terms { margin-top: 4px; text-align: justify; }
  .sig { margin-top: 24px; border-top: 1px solid #000; text-align: center; padding-top: 2px; }
</style></head>
<body>
  <div class="center bold">${esc(p.storeName)}</div>
  ${p.storeCnpj ? `<div class="center small">CNPJ: ${esc(p.storeCnpj)}</div>` : ''}
  ${p.storeAddress ? `<div class="center small">${esc(p.storeAddress)}</div>` : ''}
  ${p.storePhone ? `<div class="center small">Tel: ${esc(p.storePhone)}</div>` : ''}

  <div class="separator"></div>
  <div class="homolog-warn">COMPROVANTE DE CREDIÁRIO<br/>NÃO É DOCUMENTO FISCAL</div>

  <table>
    <thead>
      <tr>
        <th class="col-idx">#</th>
        <th class="col-desc">DESCRIÇÃO</th>
        <th class="col-num">QTD</th>
        <th class="col-num">UNIT</th>
        <th class="col-num">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="separator"></div>
  <div class="row"><span>Qtd. total de itens</span><span>${p.items.reduce((s, i) => s + i.quantity, 0)}</span></div>
  <div class="row"><span>Subtotal</span><span>${money(p.subtotal)}</span></div>
  ${p.discount > 0 ? `<div class="row"><span>Desconto</span><span>- ${money(p.discount)}</span></div>` : ''}
  ${p.surcharge > 0 ? `<div class="row"><span>Acréscimo</span><span>+ ${money(p.surcharge)}</span></div>` : ''}
  <div class="total-row"><span>VALOR TOTAL R$</span><span>${money(p.total).replace('R$ ', '')}</span></div>
  <div class="row"><span>FORMA DE PAGAMENTO</span><span>CREDIÁRIO</span></div>

  <div class="separator"></div>
  <div class="bold">DADOS DO CLIENTE</div>
  <div>Nome: ${esc(p.customerName)}</div>
  ${p.customerDocument ? `<div>CPF/CNPJ: ${esc(p.customerDocument)}</div>` : ''}
  ${p.customerPhone ? `<div>Tel: ${esc(p.customerPhone)}</div>` : ''}

  <div class="separator"></div>
  <div class="bold center">PARCELAS (${p.installments.length}x)</div>
  <table>
    <thead>
      <tr>
        <th class="col-desc">PARCELA / VENCIMENTO</th>
        <th class="col-num">VALOR</th>
      </tr>
    </thead>
    <tbody>
      ${parcelasRows}
    </tbody>
  </table>

  <div class="separator"></div>
  <div class="row small">
    <span>Emissão: ${fmtDateTime(p.issuedAt)}</span>
    ${p.saleNumber != null ? `<span>Venda: ${esc(String(p.saleNumber))}</span>` : '<span></span>'}
  </div>
  ${p.operatorName ? `<div class="small">Operador: ${esc(p.operatorName)}</div>` : ''}

  ${p.notes ? `<div class="separator"></div><div class="small">Obs: ${esc(p.notes)}</div>` : ''}

  <div class="separator"></div>
  <div class="terms">Li e estou de acordo.</div>
  <div class="small" style="margin-top:4px">${cityLabel}${fmtDateTime(p.issuedAt).split(' ')[0]}</div>

  <div class="sig">Assinatura do cliente</div>
  <div class="small center">${docLine}</div>
</body></html>`;
}

/**
 * Calcula as parcelas com base na configuração da forma de pagamento
 * "Crediário" cadastrada (installments_count, installment_interval,
 * installment_period, installment_start_rule).
 */
export function computeInstallments(
  total: number,
  config: {
    installments_count: number;
    installment_interval: number;
    installment_period: 'day' | 'week' | 'month';
    installment_start_rule: 'general' | 'fixed_days' | 'next_month';
  },
  issuedAt: Date,
  firstDueDateOverride?: Date,
): { number: number; dueDate: string; amount: number }[] {
  const n = Math.max(1, config.installments_count || 1);
  const interval = Math.max(1, config.installment_interval || 1);
  const perParcel = Math.floor((total * 100) / n) / 100;
  const remainder = Math.round((total - perParcel * n) * 100) / 100;

  const addTo = (base: Date, i: number): Date => {
    const d = new Date(base);
    if (config.installment_period === 'day') d.setDate(d.getDate() + interval * i);
    else if (config.installment_period === 'week') d.setDate(d.getDate() + 7 * interval * i);
    else d.setMonth(d.getMonth() + interval * i);
    return d;
  };

  const firstDue = (): Date => {
    if (config.installment_start_rule === 'next_month') {
      const d = new Date(issuedAt);
      d.setMonth(d.getMonth() + 1);
      return d;
    }
    // 'general' e 'fixed_days' → soma o intervalo à emissão
    return addTo(issuedAt, 1);
  };

  const first = firstDueDateOverride ?? firstDue();
  const out: { number: number; dueDate: string; amount: number }[] = [];
  for (let i = 0; i < n; i++) {
    const due = i === 0 ? first : addTo(first, i);
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    const amount = i === n - 1 ? +(perParcel + remainder).toFixed(2) : perParcel;
    out.push({ number: i + 1, dueDate: iso, amount });
  }
  return out;
}

export async function printCrediarioReceipt(payload: CrediarioReceiptPayload): Promise<void> {
  const html = buildHTML(payload);
  const copies = payload.copies === 1 ? 1 : 2;

  // Abre uma janela por via — mesmo padrão do DANFE NFC-e (printDanfeFromRecord):
  // o navegador exibe o diálogo nativo de impressão e o operador confirma.
  for (let i = 0; i < copies; i++) {
    const printWindow = window.open('', '_blank', 'width=420,height=750');
    if (!printWindow) {
      throw new Error('Pop-up bloqueado. Permita pop-ups para imprimir o comprovante.');
    }
    // Adiciona um botão de impressão (fallback) e dispara window.print() após o load.
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
    // Delay entre cópias para o navegador liberar a fila.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500));
    try { printWindow.print(); } catch (_) { /* noop */ }
  }
}