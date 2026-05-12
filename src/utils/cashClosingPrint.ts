import type { CloseCashSale } from '@/components/pdv-v2/PDVV2CloseCashDialog';

const ORIGIN_LABEL: Record<CloseCashSale['origin'], string> = {
  balcao: 'Vendas Balcão',
  cardapio_retirada: 'Retiradas (cobradas no PDV)',
  cardapio_delivery: 'Deliveries',
  mesa: 'Mesas Importadas',
  outros: 'Outros',
};

function fmt(v: number) {
  return v.toFixed(2).replace('.', ',');
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export interface CashClosingPrintInput {
  companyName?: string;
  paperSize?: '58mm' | '80mm';
  expectedAmount: number;
  sales: CloseCashSale[];
  /** Quando informado, inclui um cabeçalho com horários do caixa. */
  registerInfo?: {
    openedAt?: string | null;
    closedAt?: string | null;
    openingAmount?: number | null;
    closingAmount?: number | null;
    difference?: number | null;
    operatorName?: string | null;
    notes?: string | null;
    status?: 'open' | 'closed' | string;
  };
}

/**
 * Gera e dispara a impressão do relatório detalhado de fechamento de caixa.
 * Reaproveitado pelo dialog de fechamento (PDV V2) e pelo Relatório de Caixa.
 */
export function printCashClosingDetailed(input: CashClosingPrintInput) {
  const { companyName, paperSize = '80mm', expectedAmount, sales, registerInfo } = input;
  const w = window.open('', '_blank');
  if (!w) return;

  const now = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const detailed: Record<string, Record<string, { total: number; count: number }>> = {};
  for (const s of sales) {
    const o = s.origin || 'outros';
    const p = s.payment_method_name || 'Sem forma';
    if (!detailed[o]) detailed[o] = {};
    if (!detailed[o][p]) detailed[o][p] = { total: 0, count: 0 };
    detailed[o][p].total += s.final_total;
    detailed[o][p].count += 1;
  }

  const byPayment: Record<string, { total: number; count: number }> = {};
  for (const s of sales) {
    const p = s.payment_method_name || 'Sem forma';
    if (!byPayment[p]) byPayment[p] = { total: 0, count: 0 };
    byPayment[p].total += s.final_total;
    byPayment[p].count += 1;
  }

  const totalGeral = sales.reduce((acc, s) => acc + s.final_total, 0);
  const totalVendas = sales.length;

  const originSections = Object.entries(detailed).map(([origin, methods]) => {
    const subtotal = Object.values(methods).reduce((s, v) => s + v.total, 0);
    const subcount = Object.values(methods).reduce((s, v) => s + v.count, 0);
    const rows = Object.entries(methods)
      .map(([pay, v]) => `
        <div class="row">
          <span>${pay} <small>(${v.count})</small></span>
          <span>R$ ${fmt(v.total)}</span>
        </div>`).join('');
    return `
      <div class="section">
        <div class="row bold">
          <span>${ORIGIN_LABEL[origin as CloseCashSale['origin']] || origin} (${subcount})</span>
          <span>R$ ${fmt(subtotal)}</span>
        </div>
        ${rows}
      </div>
      <div class="divider"></div>`;
  }).join('');

  const paymentRows = Object.entries(byPayment)
    .map(([pay, v]) => `
      <div class="row">
        <span>${pay} <small>(${v.count})</small></span>
        <span>R$ ${fmt(v.total)}</span>
      </div>`).join('');

  const headerInfoBlock = registerInfo ? `
    <div class="section">
      ${registerInfo.operatorName ? `<div class="row"><span>Operador:</span><span>${registerInfo.operatorName}</span></div>` : ''}
      <div class="row"><span>Abertura:</span><span>${fmtDateTime(registerInfo.openedAt)}</span></div>
      <div class="row"><span>Fechamento:</span><span>${registerInfo.status === 'open' ? 'Em aberto' : fmtDateTime(registerInfo.closedAt)}</span></div>
      ${registerInfo.openingAmount != null ? `<div class="row"><span>Valor de abertura:</span><span>R$ ${fmt(Number(registerInfo.openingAmount))}</span></div>` : ''}
      ${registerInfo.closingAmount != null ? `<div class="row"><span>Valor fechado:</span><span>R$ ${fmt(Number(registerInfo.closingAmount))}</span></div>` : ''}
      ${registerInfo.difference != null ? `<div class="row"><span>Diferença:</span><span>R$ ${fmt(Number(registerInfo.difference))}</span></div>` : ''}
    </div>
    <div class="divider"></div>` : '';

  const notesBlock = registerInfo?.notes ? `
    <div class="group-title">Observações</div>
    <div class="section"><pre style="white-space:pre-wrap;font-family:inherit;font-size:10px;">${registerInfo.notes.replace(/</g, '&lt;')}</pre></div>
    <div class="divider"></div>` : '';

  const html = `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Fechamento Detalhado</title>
    <style>
      @page { margin: 0; size: ${paperSize} auto; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; font-size: 12px; width: ${paperSize}; padding: 3mm; }
      .header { text-align: center; margin-bottom: 2mm; }
      .header h1 { font-size: 14px; font-weight: bold; }
      .header h2 { font-size: 13px; font-weight: bold; margin: 2mm 0; }
      .header p { font-size: 10px; }
      .divider { border-top: 1px dashed #000; margin: 2mm 0; }
      .section { margin: 2mm 0; }
      .row { display: flex; justify-content: space-between; margin: 1mm 0; font-size: 11px; gap: 4mm; }
      .row.bold { font-weight: bold; font-size: 12px; }
      .row.total { font-size: 13px; font-weight: bold; margin: 2mm 0; }
      .group-title { font-weight: bold; font-size: 12px; margin: 2mm 0 1mm; text-transform: uppercase; }
      .footer { text-align: center; font-size: 9px; margin-top: 3mm; color: #666; }
      small { font-weight: normal; color: #444; }
    </style></head>
    <body>
      <div class="header">
        <h1>${companyName || 'LOJA'}</h1>
        <h2>FECHAMENTO DE CAIXA</h2>
        <h2 style="font-size:11px">RELATÓRIO DETALHADO</h2>
        <p>${now}</p>
      </div>
      <div class="divider"></div>
      ${headerInfoBlock}
      <div class="section">
        <div class="row bold"><span>Valor esperado em caixa:</span><span>R$ ${fmt(expectedAmount)}</span></div>
        <div class="row"><span>Total de vendas:</span><span>${totalVendas}</span></div>
        <div class="row bold"><span>Total geral:</span><span>R$ ${fmt(totalGeral)}</span></div>
      </div>
      <div class="divider"></div>
      <div class="group-title">Por origem × forma</div>
      ${originSections || '<div class="section"><p style="font-size:10px;text-align:center;">Sem vendas</p></div><div class="divider"></div>'}
      <div class="group-title">Totais por forma de pagamento</div>
      <div class="section">${paymentRows || '<p style="font-size:10px;text-align:center;">—</p>'}</div>
      <div class="divider"></div>
      ${notesBlock}
      <p class="footer">Impresso em ${now}</p>
      <script>window.onload = function() { window.print(); window.close(); }</script>
    </body></html>`;

  w.document.write(html);
  w.document.close();
}