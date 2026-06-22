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
  /** Quando true, omite "Valor esperado" e "Diferença" no relatório. */
  blindClose?: boolean;
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
  /** Cabeçalho fiscal completo (CNPJ, endereço, telefone). */
  fiscalHeader?: {
    fantasia?: string | null;
    cnpj?: string | null;
    address?: string | null;
    phone?: string | null;
  };
  /** Movimentações manuais (sangria/suprimento) com motivo. */
  cashMovements?: Array<{
    type: 'sangria' | 'suprimento' | string;
    amount: number;
    reason?: string | null;
    created_at?: string | null;
  }>;
  /**
   * Conferência do caixa físico (estilo Gweb): por espécie, comparando
   * calculado pelo sistema vs informado pelo operador.
   */
  physicalCash?: Array<{
    species: string; // ex.: 'DINHEIRO', 'CHEQUE'
    systemAmount: number;
    operatorAmount: number;
  }>;
}

/**
 * Gera e dispara a impressão do relatório detalhado de fechamento de caixa.
 * Reaproveitado pelo dialog de fechamento (PDV V2) e pelo Relatório de Caixa.
 */
export function printCashClosingDetailed(input: CashClosingPrintInput) {
  const {
    companyName,
    paperSize = '80mm',
    expectedAmount,
    sales,
    blindClose = false,
    registerInfo,
    fiscalHeader,
    cashMovements,
    physicalCash,
  } = input;
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

  // Agrupamento por módulo de origem (PDV/Comandas vs Mercado/Frente de Caixa).
  // Só renderiza a seção quando há mais de um módulo presente, para não poluir
  // lojas que usam apenas PDV.
  const MODULE_LABEL: Record<string, string> = {
    pdv: 'PDV / Comandas',
    mercado: 'Mercado (Frente de Caixa)',
  };
  const byModule: Record<string, { total: number; count: number }> = {};
  for (const s of sales) {
    const m = (s as any).source_module || 'pdv';
    if (!byModule[m]) byModule[m] = { total: 0, count: 0 };
    byModule[m].total += s.final_total;
    byModule[m].count += 1;
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

  const moduleRows = Object.entries(byModule)
    .map(([mod, v]) => `
      <div class="row">
        <span>${MODULE_LABEL[mod] || mod} <small>(${v.count})</small></span>
        <span>R$ ${fmt(v.total)}</span>
      </div>`).join('');
  const moduleBlock = Object.keys(byModule).length > 1 ? `
    <div class="group-title">Totais por módulo</div>
    <div class="section">${moduleRows}</div>
    <div class="divider"></div>` : '';

  const headerInfoBlock = registerInfo ? `
    <div class="section">
      ${registerInfo.operatorName ? `<div class="row"><span>Operador:</span><span>${registerInfo.operatorName}</span></div>` : ''}
      <div class="row"><span>Abertura:</span><span>${fmtDateTime(registerInfo.openedAt)}</span></div>
      <div class="row"><span>Fechamento:</span><span>${registerInfo.status === 'open' ? 'Em aberto' : fmtDateTime(registerInfo.closedAt)}</span></div>
      ${registerInfo.openingAmount != null ? `<div class="row"><span>Valor de abertura:</span><span>R$ ${fmt(Number(registerInfo.openingAmount))}</span></div>` : ''}
      ${registerInfo.closingAmount != null ? `<div class="row"><span>Valor fechado:</span><span>R$ ${fmt(Number(registerInfo.closingAmount))}</span></div>` : ''}
      ${(!blindClose && registerInfo.difference != null) ? `<div class="row"><span>Diferença:</span><span>R$ ${fmt(Number(registerInfo.difference))}</span></div>` : ''}
    </div>
    <div class="divider"></div>` : '';

  const notesBlock = registerInfo?.notes ? `
    <div class="group-title">Observações</div>
    <div class="section"><pre style="white-space:pre-wrap;font-family:inherit;font-size:10px;">${registerInfo.notes.replace(/</g, '&lt;')}</pre></div>
    <div class="divider"></div>` : '';

  const fiscalHeaderBlock = fiscalHeader ? `
    <div class="section">
      ${fiscalHeader.fantasia ? `<div class="row"><span>Fantasia:</span><span>${fiscalHeader.fantasia}</span></div>` : ''}
      ${fiscalHeader.cnpj ? `<div class="row"><span>CNPJ:</span><span>${fiscalHeader.cnpj}</span></div>` : ''}
      ${fiscalHeader.address ? `<div class="row"><span>Endereço:</span><span>${fiscalHeader.address}</span></div>` : ''}
      ${fiscalHeader.phone ? `<div class="row"><span>Telefone:</span><span>${fiscalHeader.phone}</span></div>` : ''}
    </div>
    <div class="divider"></div>` : '';

  const movementsBlock = (cashMovements && cashMovements.length > 0) ? (() => {
    const supr = cashMovements.filter((m) => m.type === 'suprimento');
    const sang = cashMovements.filter((m) => m.type === 'sangria');
    const supTotal = supr.reduce((s, m) => s + Number(m.amount || 0), 0);
    const sanTotal = sang.reduce((s, m) => s + Number(m.amount || 0), 0);
    const rows: string[] = [];
    rows.push(`<div class="row bold"><span>(+) SUPRIMENTO</span><span>R$ ${fmt(supTotal)}</span></div>`);
    supr.forEach((m) => {
      rows.push(`<div class="row"><span style="padding-left:8px;">Motivo: ${(m.reason || '—').replace(/</g, '&lt;')}</span><span>R$ ${fmt(Number(m.amount || 0))}</span></div>`);
    });
    rows.push(`<div class="row bold"><span>(−) SANGRIA</span><span>R$ ${fmt(sanTotal)}</span></div>`);
    sang.forEach((m) => {
      rows.push(`<div class="row"><span style="padding-left:8px;">Motivo: ${(m.reason || '—').replace(/</g, '&lt;')}</span><span>R$ ${fmt(Number(m.amount || 0))}</span></div>`);
    });
    return `
      <div class="group-title">Movimentações Manuais</div>
      <div class="section">${rows.join('')}</div>
      <div class="divider"></div>`;
  })() : '';

  const physicalCashBlock = (physicalCash && physicalCash.length > 0) ? (() => {
    const sysTotal = physicalCash.reduce((s, r) => s + r.systemAmount, 0);
    const opTotal = physicalCash.reduce((s, r) => s + r.operatorAmount, 0);
    const rows = physicalCash.map((r) => {
      const diff = r.operatorAmount - r.systemAmount;
      return `
        <div class="row"><span>(+) ${r.species}</span><span>Sis. R$ ${fmt(r.systemAmount)}</span></div>
        <div class="row"><span style="padding-left:8px;">Operador</span><span>Op. R$ ${fmt(r.operatorAmount)}</span></div>
        <div class="row"><span style="padding-left:8px;">Diferença</span><span>R$ ${fmt(diff)}</span></div>`;
    }).join('');
    return `
      <div class="group-title">Caixa Físico</div>
      <div class="section">
        ${rows}
        <div class="row bold"><span>(=) Total Sistema</span><span>R$ ${fmt(sysTotal)}</span></div>
        <div class="row bold"><span>(=) Total Operador</span><span>R$ ${fmt(opTotal)}</span></div>
        <div class="row bold"><span>(=) Diferença</span><span>R$ ${fmt(opTotal - sysTotal)}</span></div>
      </div>
      <div class="divider"></div>`;
  })() : '';

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
      ${fiscalHeaderBlock}
      ${headerInfoBlock}
      <div class="section">
        ${blindClose ? '' : `<div class="row bold"><span>Valor esperado em caixa:</span><span>R$ ${fmt(expectedAmount)}</span></div>`}
        <div class="row"><span>Total de vendas:</span><span>${totalVendas}</span></div>
        <div class="row bold"><span>Total geral:</span><span>R$ ${fmt(totalGeral)}</span></div>
      </div>
      <div class="divider"></div>
      <div class="group-title">Por origem × forma</div>
      ${originSections || '<div class="section"><p style="font-size:10px;text-align:center;">Sem vendas</p></div><div class="divider"></div>'}
      <div class="group-title">Totais por forma de pagamento</div>
      <div class="section">${paymentRows || '<p style="font-size:10px;text-align:center;">—</p>'}</div>
      <div class="divider"></div>
      ${moduleBlock}
      ${movementsBlock}
      ${physicalCashBlock}
      ${notesBlock}
      <p class="footer">Impresso em ${now}</p>
      <script>window.onload = function() { window.print(); window.close(); }</script>
    </body></html>`;

  w.document.write(html);
  w.document.close();
}