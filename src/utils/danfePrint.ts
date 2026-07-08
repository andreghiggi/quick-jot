/**
 * Renderiza uma DANFE simplificada (HTML imprimível) a partir do XML da NF-e
 * e abre em nova janela chamando window.print().
 *
 * Não é a DANFE oficial ABNT — é um espelho legível com os campos essenciais
 * (emitente, destinatário, itens, totais, chave, informações complementares)
 * suficiente para conferência e arquivo interno.
 */

function esc(s: any): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function money(v: any): string {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function num(v: any, digits = 4): string {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || '';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function fmtChave(chave?: string | null): string {
  if (!chave) return '';
  return chave.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export function renderDanfeFromXml(xmlText: string): void {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const q = (sel: string, root: Element | Document = doc): string => {
    const el = root.querySelector(sel);
    return el?.textContent?.trim() || '';
  };

  const infNFe = doc.querySelector('infNFe');
  const chave = (infNFe?.getAttribute('Id') || '').replace(/^NFe/, '');

  // Emitente
  const emit = doc.querySelector('emit');
  const emitNome = q('xNome', emit || doc);
  const emitFant = q('xFant', emit || doc);
  const emitCnpj = q('CNPJ', emit || doc);
  const emitIE = q('IE', emit || doc);
  const emitEnd = emit?.querySelector('enderEmit');
  const emitEndereco = [
    q('xLgr', emitEnd || doc),
    q('nro', emitEnd || doc),
    q('xBairro', emitEnd || doc),
    q('xMun', emitEnd || doc),
    q('UF', emitEnd || doc),
    q('CEP', emitEnd || doc),
  ].filter(Boolean).join(', ');

  // Destinatário
  const dest = doc.querySelector('dest');
  const destNome = q('xNome', dest || doc);
  const destDoc = q('CNPJ', dest || doc) || q('CPF', dest || doc);
  const destIE = q('IE', dest || doc);
  const destEnd = dest?.querySelector('enderDest');
  const destEndereco = [
    q('xLgr', destEnd || doc),
    q('nro', destEnd || doc),
    q('xBairro', destEnd || doc),
    q('xMun', destEnd || doc),
    q('UF', destEnd || doc),
    q('CEP', destEnd || doc),
  ].filter(Boolean).join(', ');

  // Identificação
  const ide = doc.querySelector('ide');
  const numero = q('nNF', ide || doc);
  const serie = q('serie', ide || doc);
  const natOp = q('natOp', ide || doc);
  const dhEmi = q('dhEmi', ide || doc);
  const dhSaiEnt = q('dhSaiEnt', ide || doc);

  // Itens
  const items: string[] = [];
  doc.querySelectorAll('det').forEach((det, idx) => {
    const prod = det.querySelector('prod');
    if (!prod) return;
    const cProd = q('cProd', prod);
    const xProd = q('xProd', prod);
    const ncm = q('NCM', prod);
    const cfop = q('CFOP', prod);
    const uCom = q('uCom', prod);
    const qCom = q('qCom', prod);
    const vUn = q('vUnCom', prod);
    const vTot = q('vProd', prod);
    const ean = q('cEAN', prod);
    items.push(`
      <tr>
        <td class="c">${esc(det.getAttribute('nItem') || String(idx + 1))}</td>
        <td>${esc(cProd)}</td>
        <td>${esc(xProd)}${ean && ean !== 'SEM GTIN' ? `<div class="muted">EAN ${esc(ean)}</div>` : ''}</td>
        <td class="c">${esc(ncm)}</td>
        <td class="c">${esc(cfop)}</td>
        <td class="c">${esc(uCom)}</td>
        <td class="r">${num(qCom)}</td>
        <td class="r">${money(vUn)}</td>
        <td class="r">${money(vTot)}</td>
      </tr>
    `);
  });

  // Totais
  const ICMSTot = doc.querySelector('ICMSTot');
  const vProd = q('vProd', ICMSTot || doc);
  const vFrete = q('vFrete', ICMSTot || doc);
  const vDesc = q('vDesc', ICMSTot || doc);
  const vOutro = q('vOutro', ICMSTot || doc);
  const vNF = q('vNF', ICMSTot || doc);
  const vICMS = q('vICMS', ICMSTot || doc);
  const vICMSST = q('vST', ICMSTot || doc);
  const vIPI = q('vIPI', ICMSTot || doc);

  // Info complementar
  const infCpl = q('infCpl');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>DANFE - NF-e ${esc(numero)}/${esc(serie)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 12px; color: #111; }
    h1 { font-size: 14px; margin: 0 0 4px 0; }
    h2 { font-size: 11px; margin: 10px 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px; color: #444; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    td, th { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
    th { background: #f0f0f0; font-weight: 600; }
    .r { text-align: right; }
    .c { text-align: center; }
    .muted { color: #666; font-size: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .box { border: 1px solid #999; padding: 6px 8px; }
    .label { font-size: 9px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
    .val { font-size: 12px; font-weight: 600; }
    .chave { font-family: 'Courier New', monospace; letter-spacing: 1px; }
    .totais { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
    .totais .box { padding: 4px 6px; }
    .actions { position: fixed; top: 8px; right: 8px; }
    .actions button { padding: 6px 12px; font-size: 12px; cursor: pointer; }
    @media print { .actions { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Fechar</button>
  </div>

  <h1>DANFE — NF-e ${esc(numero)} · série ${esc(serie)}</h1>
  <div class="chave"><strong>Chave:</strong> ${esc(fmtChave(chave))}</div>
  <div class="muted">Natureza: ${esc(natOp)} · Emissão: ${esc(fmtDate(dhEmi))}${dhSaiEnt ? ` · Saída/Entrada: ${esc(fmtDate(dhSaiEnt))}` : ''}</div>

  <h2>Emitente</h2>
  <div class="box">
    <div class="val">${esc(emitNome)}${emitFant ? ` <span class="muted">(${esc(emitFant)})</span>` : ''}</div>
    <div>CNPJ: ${esc(emitCnpj)} · IE: ${esc(emitIE)}</div>
    <div class="muted">${esc(emitEndereco)}</div>
  </div>

  <h2>Destinatário</h2>
  <div class="box">
    <div class="val">${esc(destNome)}</div>
    <div>Doc: ${esc(destDoc)}${destIE ? ` · IE: ${esc(destIE)}` : ''}</div>
    <div class="muted">${esc(destEndereco)}</div>
  </div>

  <h2>Itens (${items.length})</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Código</th>
        <th>Descrição</th>
        <th>NCM</th>
        <th>CFOP</th>
        <th>Un</th>
        <th>Qtd</th>
        <th>Vl. Unit.</th>
        <th>Vl. Total</th>
      </tr>
    </thead>
    <tbody>${items.join('')}</tbody>
  </table>

  <h2>Totais</h2>
  <div class="totais">
    <div class="box"><div class="label">Produtos</div><div class="val">${money(vProd)}</div></div>
    <div class="box"><div class="label">Frete</div><div class="val">${money(vFrete)}</div></div>
    <div class="box"><div class="label">Desconto</div><div class="val">${money(vDesc)}</div></div>
    <div class="box"><div class="label">Outros</div><div class="val">${money(vOutro)}</div></div>
    <div class="box"><div class="label">ICMS</div><div class="val">${money(vICMS)}</div></div>
    <div class="box"><div class="label">ICMS ST</div><div class="val">${money(vICMSST)}</div></div>
    <div class="box"><div class="label">IPI</div><div class="val">${money(vIPI)}</div></div>
    <div class="box" style="background:#e8f5e8"><div class="label">Total da NF-e</div><div class="val">${money(vNF)}</div></div>
  </div>

  ${infCpl ? `<h2>Informações Complementares</h2><div class="box muted" style="white-space:pre-wrap">${esc(infCpl)}</div>` : ''}

  <div class="muted" style="margin-top:16px; text-align:center;">Espelho gerado pelo ComandaTech · Documento fiscal original: consultar SEFAZ pela chave acima.</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) {
    alert('Pop-up bloqueado. Libere pop-ups para este site para visualizar a DANFE.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}