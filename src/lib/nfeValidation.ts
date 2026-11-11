export type NfePendingField = { tab: 'geral' | 'pagamentos' | 'transporte'; msg: string };

export type NfeValidationInput = {
  tipo: 'pj' | 'pf'; documento: string; nome: string; logradouro: string; numero: string;
  bairro: string; cidade: string; uf: string; cep: string; ibge: string; indIE: string; ie: string;
  natureza: string; items: Array<{ descricao: string; ncm: string; cfop: string; quantidade: number; valor_unitario: number }>;
};

/** Checks entered values only: never guesses tax classifications or municipality codes. */
export function nfeRecipientItemErrors(v: NfeValidationInput): NfePendingField[] {
  const errors: NfePendingField[] = [];
  const add = (msg: string) => errors.push({ tab: 'geral', msg });
  if (v.documento.replace(/\D/g, '').length !== (v.tipo === 'pj' ? 14 : 11)) add(`Destinatário: ${v.tipo === 'pj' ? 'CNPJ deve conter 14' : 'CPF deve conter 11'} dígitos.`);
  for (const [label, value] of [['Nome / Razão social', v.nome], ['Logradouro', v.logradouro], ['Número', v.numero], ['Bairro', v.bairro], ['Cidade', v.cidade]]) {
    if (!value.trim()) add(`Destinatário: ${label} é obrigatório.`);
  }
  if (!/^[A-Z]{2}$/.test(v.uf)) add('Destinatário: informe a UF com duas letras.');
  if (!/^\d{8}$/.test(v.cep.replace(/\D/g, ''))) add('Destinatário: CEP deve conter 8 dígitos.');
  if (!/^\d{7}$/.test(v.ibge)) add('Destinatário: não foi possível identificar a cidade pelo CEP. Confira o CEP e tente novamente.');
  if (v.indIE === '1' && !v.ie.trim()) add('Destinatário: informe a inscrição estadual do contribuinte.');
  if (!v.natureza.trim()) add('Natureza da operação é obrigatória.');
  if (!v.items.length) add('Adicione pelo menos 1 item do Cadastro de Produtos.');
  v.items.forEach((it, index) => {
    const label = `Item ${index + 1}${it.descricao ? ` (${it.descricao})` : ''}`;
    if (!it.descricao.trim()) add(`${label}: descrição é obrigatória.`);
    if (!/^\d{8}$/.test(it.ncm)) add(`${label}: NCM deve conter exatamente 8 dígitos numéricos. Revise a regra tributária associada.`);
    if (!/^\d{4}$/.test(it.cfop)) add(`${label}: CFOP deve conter 4 dígitos numéricos.`);
    if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) add(`${label}: quantidade deve ser maior que zero.`);
    if (!Number.isFinite(it.valor_unitario) || it.valor_unitario <= 0) add(`${label}: valor unitário deve ser maior que zero.`);
  });
  return errors;
}