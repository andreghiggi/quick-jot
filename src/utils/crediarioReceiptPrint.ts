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
 * Enfileira em `print_queue` respeitando o número de vias configurado em
 * `pdv_settings.crediario_receipt_copies` (1 ou 2).
 *
 * Escopo: usado APENAS pelo fluxo de crediário do Frente de Caixa. Não
 * afeta impressão de cupom fiscal, DANFE NFC-e ou recibos do PDV V2.
 */
import { supabase } from '@/integrations/supabase/client';

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
  const fontSize = p.paperSize === '80mm' ? '12px' : '11px';

  const itemsRows = p.items.map((it) => {
    const line1 = `${it.quantity} x ${money(it.unit_price)}`;
    const total = money(it.quantity * it.unit_price);
    return `
      <div class="item">
        <div class="item-name">${esc(it.name)}</div>
        <div class="item-line"><span>${line1}</span><span>${total}</span></div>
      </div>`;
  }).join('');

  const parcelasRows = p.installments.map((i) => `
    <div class="row">
      <span>${String(i.number).padStart(2, '0')}/${String(p.installments.length).padStart(2, '0')} — ${fmtDate(i.dueDate)}</span>
      <span>${money(i.amount)}</span>
    </div>`).join('');

  const cityLabel = p.city ? `${esc(p.city)}, ` : '';
  const docLine = p.customerDocument ? `CPF/CNPJ: ${esc(p.customerDocument)}` : 'CPF: ______________________';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { size: ${width} auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: ${fontSize}; margin: 0; padding: 0; width: ${width}; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .title { font-weight: 700; text-transform: uppercase; }
  .subtitle { font-size: 10px; }
  .item { margin-bottom: 3px; }
  .item-name { word-break: break-word; }
  .item-line { display: flex; justify-content: space-between; font-size: 10px; }
  .terms { margin-top: 6px; text-align: justify; font-size: 10px; }
  .sig { margin-top: 22px; border-top: 1px solid #000; text-align: center; padding-top: 2px; font-size: 10px; }
  .footer { margin-top: 6px; font-size: 10px; text-align: center; }
</style></head>
<body>
  <div class="center bold">${esc(p.storeName)}</div>
  ${p.storeCnpj ? `<div class="center subtitle">CNPJ: ${esc(p.storeCnpj)}</div>` : ''}
  ${p.storeAddress ? `<div class="center subtitle">${esc(p.storeAddress)}</div>` : ''}
  ${p.storePhone ? `<div class="center subtitle">Tel: ${esc(p.storePhone)}</div>` : ''}

  <div class="sep"></div>
  <div class="center title">Comprovante de Crediário</div>
  <div class="center subtitle">*** NÃO É DOCUMENTO FISCAL ***</div>
  <div class="sep"></div>

  <div class="row"><span>Data:</span><span>${fmtDateTime(p.issuedAt)}</span></div>
  ${p.saleNumber != null ? `<div class="row"><span>Venda nº:</span><span>${esc(String(p.saleNumber))}</span></div>` : ''}
  ${p.operatorName ? `<div class="row"><span>Operador:</span><span>${esc(p.operatorName)}</span></div>` : ''}

  <div class="sep"></div>
  <div class="bold">CLIENTE</div>
  <div>${esc(p.customerName)}</div>
  ${p.customerPhone ? `<div class="subtitle">Tel: ${esc(p.customerPhone)}</div>` : ''}
  ${p.customerDocument ? `<div class="subtitle">Doc: ${esc(p.customerDocument)}</div>` : ''}

  <div class="sep"></div>
  <div class="bold">ITENS</div>
  ${itemsRows}

  <div class="sep"></div>
  <div class="row"><span>Subtotal:</span><span>${money(p.subtotal)}</span></div>
  ${p.discount > 0 ? `<div class="row"><span>Desconto:</span><span>- ${money(p.discount)}</span></div>` : ''}
  ${p.surcharge > 0 ? `<div class="row"><span>Acréscimo:</span><span>+ ${money(p.surcharge)}</span></div>` : ''}
  <div class="row bold"><span>TOTAL A RECEBER:</span><span>${money(p.total)}</span></div>

  <div class="sep"></div>
  <div class="bold">PARCELAS (${p.installments.length}x)</div>
  ${parcelasRows}

  ${p.notes ? `<div class="sep"></div><div class="subtitle">Obs: ${esc(p.notes)}</div>` : ''}

  <div class="sep"></div>
  <div class="terms">Li e estou de acordo com este documento.</div>
  <div class="subtitle" style="margin-top:4px">${cityLabel}${fmtDateTime(p.issuedAt).split(' ')[0]}</div>

  <div class="sig">Assinatura do cliente</div>
  <div class="subtitle center">${docLine}</div>

  <div class="footer">— fim do comprovante —</div>
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
  const rows = Array.from({ length: copies }).map((_, i) => ({
    company_id: payload.companyId,
    html_content: html,
    label: copies === 2
      ? `Crediário ${i === 0 ? 'Loja' : 'Cliente'} — ${payload.customerName.slice(0, 20)}`
      : `Crediário — ${payload.customerName.slice(0, 20)}`,
  }));
  const { error } = await supabase.from('print_queue').insert(rows);
  if (error) throw error;
}