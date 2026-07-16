/**
 * Parser fiel de NFC-e / NF-e a partir do XML autorizado.
 * Trabalha tanto com `<nfeProc>` (envelope autorizado com protocolo)
 * quanto com `<NFe>` puro. É a fonte de verdade para o Espelho Fiscal.
 */

export interface ParsedFiscalPayment {
  tPag: string;        // '01' Dinheiro, '03' Crédito, '04' Débito, '17' PIX, '05' Crediário, '99' Outros...
  vPag: number;
  tpIntegra?: string;  // 1=integrado, 2=não integrado
  cnpjCredenciadora?: string;
  bandeira?: string;   // tBand: 01 Visa, 02 Mastercard...
  autorizacao?: string;
}

export interface ParsedFiscalItem {
  nItem: number;
  cProd: string;
  cEAN?: string;
  xProd: string;
  ncm: string;
  cest?: string;
  cfop: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  vDesc?: number;
}

export interface ParsedFiscalXml {
  modelo: '65' | '55';
  numero: string;
  serie: string;
  chave: string;                 // 44 dígitos
  natOp: string;
  dhEmi: string;                 // ISO
  tpEmis: string;                // 1 normal, 9 contingência
  ambiente: 'producao' | 'homologacao';
  // emitente
  emitCnpj: string;
  emitIE?: string;
  emitNome: string;
  // destinatario (opcional)
  destDoc?: string;
  destNome?: string;
  // totais
  vProd: number;
  vDesc: number;
  vNF: number;
  vICMS: number;
  vBC: number;
  // itens
  itens: ParsedFiscalItem[];
  cfops: string[];                // distintos, na ordem de aparição
  // pagamentos
  pagamentos: ParsedFiscalPayment[];
  // protocolo (se procNFe)
  cStat?: string;                 // 100 autorizada, 101 cancelada
  nProt?: string;
  dhRecbto?: string;
  digVal?: string;
}

const T_PAG: Record<string, string> = {
  '01': 'Dinheiro',
  '02': 'Cheque',
  '03': 'Cartão de Crédito',
  '04': 'Cartão de Débito',
  '05': 'Crédito Loja',
  '10': 'Vale Alimentação',
  '11': 'Vale Refeição',
  '12': 'Vale Presente',
  '13': 'Vale Combustível',
  '15': 'Boleto Bancário',
  '16': 'Depósito Bancário',
  '17': 'PIX',
  '18': 'Transferência Bancária',
  '19': 'Programa de Fidelidade',
  '90': 'Sem Pagamento',
  '99': 'Outros',
};

export function labelTPag(code: string | undefined | null): string {
  const c = String(code || '').padStart(2, '0');
  return `${c} - ${T_PAG[c] || 'Outros'}`;
}

function txt(node: Element | null | undefined, tag: string): string {
  if (!node) return '';
  const el = node.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() || '';
}
function num(node: Element | null | undefined, tag: string): number {
  const v = txt(node, tag);
  if (!v) return 0;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Faz o parse do XML autorizado. Aceita `<nfeProc>`, `<NFe>` ou base64.
 * Retorna `null` quando não é um XML fiscal válido.
 */
export function parseNfceXml(rawXml: string | null | undefined): ParsedFiscalXml | null {
  if (!rawXml || typeof rawXml !== 'string') return null;
  let xml = rawXml.trim();
  if (!xml.startsWith('<')) {
    try { xml = atob(xml); } catch { return null; }
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return null;
  }
  if (doc.getElementsByTagName('parsererror').length) return null;

  const infNFe = doc.getElementsByTagName('infNFe')[0];
  if (!infNFe) return null;

  // Chave = atributo Id sem prefixo 'NFe'
  const id = infNFe.getAttribute('Id') || '';
  const chave = id.replace(/^NFe/, '').replace(/\D/g, '');

  const ide = infNFe.getElementsByTagName('ide')[0];
  const emit = infNFe.getElementsByTagName('emit')[0];
  const dest = infNFe.getElementsByTagName('dest')[0];
  const total = infNFe.getElementsByTagName('total')[0];
  const ICMSTot = total?.getElementsByTagName('ICMSTot')[0];
  const pag = infNFe.getElementsByTagName('pag')[0];

  const mod = txt(ide, 'mod');
  const modelo: '65' | '55' = mod === '55' ? '55' : '65';
  const tpAmb = txt(ide, 'tpAmb');

  // Itens
  const itens: ParsedFiscalItem[] = [];
  const cfopSet: string[] = [];
  const dets = infNFe.getElementsByTagName('det');
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i];
    const prod = det.getElementsByTagName('prod')[0];
    if (!prod) continue;
    const cfop = txt(prod, 'CFOP');
    if (cfop && !cfopSet.includes(cfop)) cfopSet.push(cfop);
    itens.push({
      nItem: Number(det.getAttribute('nItem') || i + 1),
      cProd: txt(prod, 'cProd'),
      cEAN: txt(prod, 'cEAN') || undefined,
      xProd: txt(prod, 'xProd'),
      ncm: txt(prod, 'NCM'),
      cest: txt(prod, 'CEST') || undefined,
      cfop,
      uCom: txt(prod, 'uCom'),
      qCom: num(prod, 'qCom'),
      vUnCom: num(prod, 'vUnCom'),
      vProd: num(prod, 'vProd'),
      vDesc: num(prod, 'vDesc') || undefined,
    });
  }

  // Pagamentos
  const pagamentos: ParsedFiscalPayment[] = [];
  if (pag) {
    const detPags = pag.getElementsByTagName('detPag');
    for (let i = 0; i < detPags.length; i++) {
      const dp = detPags[i];
      const card = dp.getElementsByTagName('card')[0];
      pagamentos.push({
        tPag: txt(dp, 'tPag'),
        vPag: num(dp, 'vPag'),
        tpIntegra: txt(dp, 'tpIntegra') || undefined,
        cnpjCredenciadora: card ? txt(card, 'CNPJ') || undefined : undefined,
        bandeira: card ? txt(card, 'tBand') || undefined : undefined,
        autorizacao: card ? txt(card, 'cAut') || undefined : undefined,
      });
    }
  }

  // Protocolo (envelope nfeProc)
  const protNFe = doc.getElementsByTagName('protNFe')[0];
  const infProt = protNFe?.getElementsByTagName('infProt')[0];

  // Cancelamento: procEventoNFe com cStat 135 e tpEvento 110111
  let cStat = txt(infProt, 'cStat') || undefined;
  let nProt = txt(infProt, 'nProt') || undefined;
  const dhRecbto = txt(infProt, 'dhRecbto') || undefined;

  const procEventos = doc.getElementsByTagName('procEventoNFe');
  for (let i = 0; i < procEventos.length; i++) {
    const infEvt = procEventos[i].getElementsByTagName('infEvento')[0];
    const tpEvento = txt(infEvt, 'tpEvento');
    const cStatEvt = txt(infEvt, 'cStat');
    if (tpEvento === '110111' && (cStatEvt === '135' || cStatEvt === '155')) {
      cStat = '101'; // cancelada
      nProt = txt(infEvt, 'nProt') || nProt;
    }
  }

  return {
    modelo,
    numero: txt(ide, 'nNF'),
    serie: txt(ide, 'serie'),
    chave,
    natOp: txt(ide, 'natOp'),
    dhEmi: txt(ide, 'dhEmi') || txt(ide, 'dEmi'),
    tpEmis: txt(ide, 'tpEmis'),
    ambiente: tpAmb === '1' ? 'producao' : 'homologacao',
    emitCnpj: txt(emit, 'CNPJ') || txt(emit, 'CPF'),
    emitIE: txt(emit, 'IE') || undefined,
    emitNome: txt(emit, 'xNome'),
    destDoc: dest ? (txt(dest, 'CPF') || txt(dest, 'CNPJ') || undefined) : undefined,
    destNome: dest ? (txt(dest, 'xNome') || undefined) : undefined,
    vProd: num(ICMSTot, 'vProd'),
    vDesc: num(ICMSTot, 'vDesc'),
    vNF: num(ICMSTot, 'vNF'),
    vICMS: num(ICMSTot, 'vICMS'),
    vBC: num(ICMSTot, 'vBC'),
    itens,
    cfops: cfopSet,
    pagamentos,
    cStat,
    nProt,
    dhRecbto,
    digVal: txt(infProt, 'digVal') || undefined,
  };
}

export function formatFiscalPayments(pagamentos: ParsedFiscalPayment[]): string {
  if (!pagamentos.length) return '—';
  const showValues = pagamentos.length > 1;
  return pagamentos
    .map((p) => (showValues ? `${labelTPag(p.tPag)} (${p.vPag.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : labelTPag(p.tPag)))
    .join(' + ');
}