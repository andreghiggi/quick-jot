/** Reconstructs older persisted emission payloads without copying fiscal identity. */
export function nfeStoredForm(payload: any): any {
  if (payload?.form) return payload.form;
  const p = payload || {};
  const d = p.destinatario || {};
  const e = d.endereco || {};
  const t = p.transporte || {};
  const a = p.informacoes_adicionais || {};
  return {
    serie: p.serie || '1', ambiente: p.ambiente || 'homologacao',
    naturezaOperacao: p.natureza_operacao || 'Venda', finalidade: p.finalidade || 1,
    dhEmi: p.data_emissao, dhSaiEnt: p.data_saida_entrada,
    indPres: String(p.indicador_presenca ?? '1'), indFinal: p.consumidor_final !== 0,
    dest: { tipo: d.cpf ? 'pf' : 'pj', cnpj: d.cnpj || '', cpf: d.cpf || '', razao: d.razao_social || d.nome || '',
      ie: d.inscricao_estadual || '', indIE: String(d.indIEDest || '9'), fone: d.telefone || '',
      logradouro: e.logradouro || '', numero: e.numero || '', bairro: e.bairro || '',
      cidade: e.municipio || '', uf: e.uf || '', cep: e.cep || '', complemento: e.complemento || '', ibge: e.codigo_municipio || '' },
    items: p.itens || [], payments: p.pagamentos || [], installments: p.cobranca?.duplicatas || [], terms: '',
    modFrete: String(t.modalidade_frete ?? '9'), valorFrete: Number(p.valor_frete) || 0,
    transp: { documento: '', razao_social: '', ie: '', endereco: '', municipio: '', uf: '', ...t.transportadora },
    veiculo: { placa: '', uf: '', rntc: '', ...t.veiculo },
    vol: { quantidade: '', especie: '', marca: '', numeracao: '', peso_liquido: '', peso_bruto: '', ...t.volumes?.[0] },
    xPed: a.numero_pedido || '', infCpl: a.contribuinte || '', infAdFisco: a.fisco || '',
    autXml: p.autorizados_xml || [], refs: p.documentos_referenciados || [],
  };
}