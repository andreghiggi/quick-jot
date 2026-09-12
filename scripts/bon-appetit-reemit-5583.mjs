#!/usr/bin/env node
/** Reemite NFC-e 5583 Bon Appetit com CNPJ via Fiscal Flow (campo `cliente`). */
const FF_TOKEN = process.env.FF_TOKEN || 'nfce_67705607baf043aa8d70a97f2291c8e8';
const FF_URL = 'https://emit.agilizeerp.com.br/functions/v1/nfce-api';
const CNPJ = '43450050000183';

const item = (codigo, descricao, vUnit, ncm, cfop, csosn) => ({
  codigo, descricao, unidade: 'UN', quantidade: 1, valor_unitario: vUnit,
  ncm, cfop, csosn, cst_pis: '49', cst_cofins: '49',
  aliquota_pis: 0, aliquota_cofins: 0, aliquota_icms: 0,
});

const payload = {
  external_id: `REEMIT-5583-FINAL-${Date.now()}`,
  itens: [
    ...Array.from({ length: 4 }, () => item('P0016', 'Xis Tudo', 37, '21069090', '5102', '102')),
    ...Array.from({ length: 4 }, () => item('P0052', 'Coca Cola 600 ml', 10, '22030000', '5405', '500')),
  ],
  valor_desconto: 0,
  valor_frete: 0,
  cliente: { cnpj: CNPJ, nome: 'CONSUMIDOR' },
  pagamento: { forma_pagamento: '01', valor_pagamento: 188 },
};

async function main() {
  const resp = await fetch(FF_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': FF_TOKEN },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => ({}));
  const xml = json?.data?.xml_retorno || '';
  const nNF = xml.match(/<nNF>(\d+)<\/nNF>/)?.[1];
  console.log(JSON.stringify({
    success: json?.success,
    numero: json?.data?.numero || nNF,
    chave: json?.data?.chave_acesso,
    protocolo: json?.data?.protocolo,
    qrcode: json?.data?.qrcode_url,
    destNoXml: xml.includes('<dest>'),
    cnpjNoXml: xml.includes(CNPJ),
  }, null, 2));
  if (xml.includes('<dest>')) {
    const m = xml.match(/<dest>[\s\S]*?<\/dest>/);
    if (m) console.log('\n' + m[0]);
  }
  if (!resp.ok || !xml.includes(CNPJ)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
