import JsBarcode from 'jsbarcode';
import { formatCep, formatCpfCnpj } from './fiscalPerson';
import { NFE_FREIGHT_MODES } from './nfeForm';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const number = (v: unknown, digits = 2) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const date = (v: string, time = false) => {
  if (!v) return '';
  // Form datetime-local represents Sao Paulo, not the viewer's browser timezone.
  const input = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(v) ? `${v}-03:00` : v;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? '' : time ? d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

/** Shared read-only model 55 sheet. Blank fiscal identifiers in preview are intentional. */
export function nfeDanfeHtml(company: any, p: any, preview = true): string {
  const d = p.destinatario || {}, e = d.endereco || {}, t = p.transporte || {};
  const tr = t.transportadora || {}, ve = t.veiculo || {}, vol = t.volumes?.[0] || {};
  const items: any[] = p.itens || [];
  const totals = p.totais || {};
  const products = items.reduce((s, i) => s + (i.valor_total ?? Number(i.quantidade) * Number(i.valor_unitario)), 0);
  const key = preview ? '' : String(p.chave_acesso || '').replace(/\D/g, '');
  const nfNumber = preview ? 'A definir' : String(p.numero || '').padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
  const serie = String(p.serie || '').padStart(3, '0');
  const cell = (label: string, value: unknown, extra = '') => `<div class="nf55-cell ${extra}"><div class="nf55-label">${esc(label)}</div><div class="nf55-value">${esc(value)}</div></div>`;
  const row = (children: string, columns: string) => `<div class="nf55-row" style="grid-template-columns:${columns}">${children}</div>`;
  const title = (s: string) => `<h2>${esc(s)}</h2>`;
  let barcode = '';
  if (key.length === 44) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, key, { format: 'CODE128', displayValue: false, height: 42, width: 1, margin: 0 });
    barcode = svg.outerHTML;
  }
  const addr = [company.address_street, company.address_number, company.address_complement].filter(Boolean).join(', ');
  const cols = ['CÓDIGO PRODUTO', 'DESCRIÇÃO DO PRODUTO / SERVIÇO', 'NCM/SH', 'O/CSOSN', 'CFOP', 'UN', 'QUANT', 'VALOR UNIT', 'VALOR TOTAL', 'VALOR DESC', 'B.CÁLC ICMS', 'VALOR ICMS', 'VALOR IPI', 'ALÍQ. ICMS', 'ALÍQ. IPI'];
  const widths = [9, 25, 6, 4.5, 4.5, 3, 7, 7, 7, 5, 6, 5.5, 5, 3, 3];
  const taxFields = [
    ['BASE DE CÁLC. DO ICMS', totals.vBC], ['VALOR DO ICMS', totals.vICMS], ['BASE DE CÁLC. ICMS S.T.', totals.vBCST], ['VALOR DO ICMS SUBST.', totals.vST],
    ['V. IMP. IMPORTAÇÃO', totals.vII], ['V. ICMS UF REMET.', totals.vICMSUFRemet], ['V. FCP UF DEST.', totals.vFCPUFDest], ['V. TOTAL PRODUTOS', products],
    ['VALOR DO FRETE', p.valor_frete], ['VALOR DO SEGURO', totals.vSeg], ['DESCONTO', totals.vDesc], ['OUTRAS DESPESAS', totals.vOutro],
    ['VALOR TOTAL IPI', totals.vIPI], ['V. ICMS UF DEST.', totals.vICMSUFDest], ['V. TOT. TRIB.', totals.vTotTrib], ['V. TOTAL DA NOTA', p.valor_total],
  ];
  // Before authorization tax bases are unknown: do not infer credit from CSOSN/aliquot alone.
  const taxValue = (v: unknown) => preview && v == null ? '' : number(v);
  return `<article class="nf55-sheet">
  ${preview ? '<div class="nf55-banner">PRÉ-VISUALIZAÇÃO — SEM VALOR FISCAL</div><div class="nf55-watermark">PRÉ-VISUALIZAÇÃO</div>' : ''}
  <div class="nf55-receipt">${row(`<div>${cell('', `RECEBEMOS DE ${company.razao_social || company.name || ''} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO. EMISSÃO: ${date(p.data_emissao)} VALOR TOTAL: R$ ${number(p.valor_total)} DESTINATÁRIO: ${d.razao_social || ''}`)}${row(cell('DATA DE RECEBIMENTO', '') + cell('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', ''), '1fr 4fr')}</div><div class="nf55-cell nf55-center"><b>NF-e</b><br><b>Nº. ${esc(nfNumber)}<br>Série ${esc(serie)}</b></div>`, '4fr 1fr')}</div>
  ${row(`<div class="nf55-cell nf55-issuer"><i>IDENTIFICAÇÃO DO EMITENTE</i><strong>${esc(company.razao_social || company.name)}</strong><div>${esc(addr)}</div><div>${esc(company.address_neighborhood)} - ${esc(formatCep(company.address_cep || ''))}</div><div>${esc(company.address_city)} - ${esc(company.address_state)} Fone/Fax: ${esc(company.phone)}</div></div>
  <div class="nf55-cell nf55-center"><h1>DANFE</h1><div>Documento Auxiliar da Nota<br>Fiscal Eletrônica</div><div class="nf55-operation">0 - ENTRADA<br>1 - SAÍDA <b>${esc(p.tipo_operacao || '1')}</b></div><strong>Nº. ${esc(nfNumber)}<br>Série ${esc(serie)}</strong><div>Folha 1/1</div></div>
  <div>${cell('', barcode ? '' : preview ? 'Chave gerada após transmissão' : '', 'nf55-barcode') .replace('<div class="nf55-value"></div>', `<div class="nf55-value">${barcode}</div>`)}${cell('CHAVE DE ACESSO', key.replace(/(.{4})/g, '$1 ').trim(), 'nf55-key')}<div class="nf55-cell nf55-center">Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</div></div>`, '41% 17% 42%')}
  ${row(cell('NATUREZA DA OPERAÇÃO', p.natureza_operacao) + cell('PROTOCOLO DE AUTORIZAÇÃO DE USO', preview ? '' : [p.protocolo, p.data_autorizacao ? `${date(p.data_autorizacao)} ${date(p.data_autorizacao, true)}` : ''].filter(Boolean).join(' - ')), '58% 42%')}
  ${row(cell('INSCRIÇÃO ESTADUAL', company.inscricao_estadual) + cell('INSCRIÇÃO MUNICIPAL', company.inscricao_municipal) + cell('INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.', company.ie_substituto) + cell('CNPJ / CPF', formatCpfCnpj(company.cnpj || '')), '25% 25% 25% 25%')}
  ${title('DESTINATÁRIO / REMETENTE')}
  ${row(cell('NOME / RAZÃO SOCIAL', d.razao_social) + cell('CNPJ / CPF', formatCpfCnpj(d.cnpj || d.cpf || '')) + cell('DATA DA EMISSÃO', date(p.data_emissao)), '61% 23% 16%')}
  ${row(cell('ENDEREÇO', [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ')) + cell('BAIRRO / DISTRITO', e.bairro) + cell('CEP', formatCep(e.cep || '')) + cell('DATA DA SAÍDA/ENTRADA', date(p.data_saida_entrada)), '47% 21% 16% 16%')}
  ${row(cell('MUNICÍPIO', e.municipio) + cell('UF', e.uf) + cell('FONE / FAX', d.telefone) + cell('INSCRIÇÃO ESTADUAL', d.inscricao_estadual || (d.indIEDest === '2' ? 'ISENTO' : '')) + cell('HORA DA SAÍDA/ENTRADA', date(p.data_saida_entrada, true)), '47% 4% 16% 17% 16%')}
  ${title('FATURA / DUPLICATA')}<div class="nf55-installments">${(p.cobranca?.duplicatas || []).map((i: any) => cell('Num. ' + i.numero, `Venc. ${date(i.vencimento + 'T12:00:00-03:00')} — R$ ${number(i.valor)}`)).join('') || cell('', '')}</div>
  ${title('CÁLCULO DO IMPOSTO')}${row(taxFields.map(([l, v]) => cell(String(l), taxValue(v), 'nf55-right')).join(''), 'repeat(8,minmax(0,1fr))')}
  ${title('TRANSPORTADOR / VOLUMES TRANSPORTADOS')}
  ${row(cell('NOME / RAZÃO SOCIAL', tr.razao_social) + cell('FRETE', NFE_FREIGHT_MODES.find(m => m.code === String(t.modalidade_frete))?.label || '') + cell('CÓDIGO ANTT', ve.rntc) + cell('PLACA DO VEÍCULO', ve.placa) + cell('UF', ve.uf) + cell('CNPJ / CPF', formatCpfCnpj(tr.documento || '')), '29% 18% 13% 14% 4% 22%')}
  ${row(cell('ENDEREÇO', tr.endereco) + cell('MUNICÍPIO', tr.municipio) + cell('UF', tr.uf) + cell('INSCRIÇÃO ESTADUAL', tr.ie), '44% 30% 4% 22%')}
  ${row(cell('QUANTIDADE', vol.quantidade) + cell('ESPÉCIE', vol.especie) + cell('MARCA', vol.marca) + cell('NUMERAÇÃO', vol.numeracao) + cell('PESO BRUTO', vol.peso_bruto) + cell('PESO LÍQUIDO', vol.peso_liquido), '10% 17% 17% 17% 19% 20%')}
  ${title('DADOS DOS PRODUTOS / SERVIÇOS')}<div class="nf55-products"><table><colgroup>${widths.map(w => `<col style="width:${w / 111.5 * 100}%">`).join('')}</colgroup><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${items.map(i => {
    const vals = [i.code || '', i.descricao, i.ncm, `${i.icms_origin || '0'}/${i.csosn || i.cst || ''}`, i.cfop, i.unidade, number(i.quantidade, 4), number(i.valor_unitario, 4), number(i.valor_total ?? i.quantidade * i.valor_unitario), taxValue(i.valor_desconto), taxValue(i.base_icms), taxValue(i.valor_icms), taxValue(i.valor_ipi), number(i.icms_aliquot), number(i.ipi_aliquot)];
    return `<tr>${vals.map((v, idx) => `<td class="${idx >= 6 ? 'nf55-right' : ''}">${esc(v)}</td>`).join('')}</tr>`;
  }).join('')}<tr class="nf55-filler">${cols.map(() => '<td></td>').join('')}</tr></tbody></table></div>
  ${title('DADOS ADICIONAIS')}${row(cell('INFORMAÇÕES COMPLEMENTARES', [p.informacoes_adicionais?.contribuinte, p.informacoes_adicionais?.numero_pedido ? `ORDEM DE COMPRA: ${p.informacoes_adicionais.numero_pedido}` : ''].filter(Boolean).join('\n'), 'nf55-additional') + cell('RESERVADO AO FISCO', p.informacoes_adicionais?.fisco, 'nf55-additional'), '66% 34%')}
  <footer>ComandaTech${preview ? ' — Pré-visualização sem valor fiscal' : ''}</footer></article>`;
}

/** Maps authorized XML only; never changes persisted records or fiscal data. */
export function nfeDanfeFromXml(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || !doc.querySelector('infNFe') || doc.querySelector('ide > mod')?.textContent !== '55') throw new Error('XML de NF-e modelo 55 inválido.');
  const q = (root: ParentNode | null, tag: string) => root?.querySelector(tag)?.textContent?.trim() || '';
  const ide = doc.querySelector('ide'), emit = doc.querySelector('emit'), dest = doc.querySelector('dest');
  const ee = emit?.querySelector('enderEmit') || null, de = dest?.querySelector('enderDest') || null;
  const tt = doc.querySelector('transp'), tr = tt?.querySelector('transporta') || null, ve = tt?.querySelector('veicTransp') || null, vol = tt?.querySelector('vol') || null;
  const totals: Record<string, string> = {};
  doc.querySelector('ICMSTot')?.childNodes.forEach(n => { if (n.nodeType === 1) totals[n.nodeName] = n.textContent || ''; });
  return nfeDanfeHtml({ razao_social: q(emit, 'xNome'), cnpj: q(emit, 'CNPJ'), inscricao_estadual: q(emit, 'IE'), inscricao_municipal: q(emit, 'IM'), ie_substituto: q(emit, 'IEST'), address_street: q(ee, 'xLgr'), address_number: q(ee, 'nro'), address_complement: q(ee, 'xCpl'), address_neighborhood: q(ee, 'xBairro'), address_city: q(ee, 'xMun'), address_state: q(ee, 'UF'), address_cep: q(ee, 'CEP'), phone: q(ee, 'fone') }, {
    numero: q(ide, 'nNF'), serie: q(ide, 'serie'), chave_acesso: doc.querySelector('infNFe')?.getAttribute('Id')?.replace(/^NFe/, ''), protocolo: q(doc.querySelector('infProt'), 'nProt'), data_autorizacao: q(doc.querySelector('infProt'), 'dhRecbto'), tipo_operacao: q(ide, 'tpNF'), natureza_operacao: q(ide, 'natOp'), data_emissao: q(ide, 'dhEmi'), data_saida_entrada: q(ide, 'dhSaiEnt'), totais: totals, valor_total: totals.vNF, valor_frete: totals.vFrete,
    destinatario: { razao_social: q(dest, 'xNome'), cnpj: q(dest, 'CNPJ'), cpf: q(dest, 'CPF'), inscricao_estadual: q(dest, 'IE'), telefone: q(de, 'fone'), endereco: { logradouro: q(de, 'xLgr'), numero: q(de, 'nro'), complemento: q(de, 'xCpl'), bairro: q(de, 'xBairro'), municipio: q(de, 'xMun'), uf: q(de, 'UF'), cep: q(de, 'CEP') } },
    transporte: { modalidade_frete: q(tt, 'modFrete'), transportadora: { razao_social: q(tr, 'xNome'), documento: q(tr, 'CNPJ') || q(tr, 'CPF'), endereco: q(tr, 'xEnder'), municipio: q(tr, 'xMun'), uf: q(tr, 'UF'), ie: q(tr, 'IE') }, veiculo: { placa: q(ve, 'placa'), uf: q(ve, 'UF'), rntc: q(ve, 'RNTC') }, volumes: [{ quantidade: q(vol, 'qVol'), especie: q(vol, 'esp'), marca: q(vol, 'marca'), numeracao: q(vol, 'nVol'), peso_bruto: q(vol, 'pesoB'), peso_liquido: q(vol, 'pesoL') }] },
    cobranca: { duplicatas: Array.from(doc.querySelectorAll('cobr > dup')).map(i => ({ numero: q(i, 'nDup'), vencimento: q(i, 'dVenc'), valor: q(i, 'vDup') })) },
    informacoes_adicionais: { contribuinte: q(doc.querySelector('infAdic'), 'infCpl'), fisco: q(doc.querySelector('infAdic'), 'infAdFisco') },
    itens: Array.from(doc.querySelectorAll('det')).map(i => {
      const prod = i.querySelector('prod'), tax = i.querySelector('imposto');
      return { code: q(prod, 'cProd'), descricao: q(prod, 'xProd'), ncm: q(prod, 'NCM'), cfop: q(prod, 'CFOP'), unidade: q(prod, 'uCom'), quantidade: q(prod, 'qCom'), valor_unitario: q(prod, 'vUnCom'), valor_total: q(prod, 'vProd'), valor_desconto: q(prod, 'vDesc'), icms_origin: q(tax, 'ICMS orig'), csosn: q(tax, 'ICMS CSOSN') || q(tax, 'ICMS CST'), base_icms: q(tax, 'ICMS vBC'), valor_icms: q(tax, 'ICMS vICMS'), valor_ipi: q(tax, 'IPI vIPI'), icms_aliquot: q(tax, 'ICMS pICMS'), ipi_aliquot: q(tax, 'IPI pIPI') };
    }),
  }, false);
}

export function openNfeDanfe(html: string, print = false): void {
  const w = window.open('', '_blank', 'width=1000,height=1000');
  if (!w) throw new Error('Libere pop-ups para visualizar o DANFE.');
  const css = Array.from(document.querySelectorAll('link[rel="stylesheet"],style')).map(n => n.outerHTML).join('');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFE NF-e modelo 55</title>${css}</head><body class="nf55-print">${html}</body></html>`);
  w.document.close();
  if (print) w.onload = () => { w.focus(); w.print(); };
}