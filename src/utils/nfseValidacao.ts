import { NFSE_CTRIBNAC_MAP } from '@/data/nfse-ctribnac';

export type Problema = {
  nivel: 'erro' | 'aviso';
  campo: string;
  mensagem: string;
};

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

export function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  for (const t of [12, 13]) {
    const pesos = t === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * pesos[i];
    const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

export type ContextoNfse = {
  tokenOk: boolean;
  documento: string;
  nome: string;
  descricao: string;
  valorServico: number;
  municipioPrestacao: string;
  codTribNac: string;
  nbs: string;
  tomadorTemEndereco: boolean;
  ambienteHomologacao: boolean;
};

/** Mesmas regras do Emit Smart (nfse-validacao.ts) -- valida ANTES de chamar
 * a API, pra não gastar número de DPS com erro que já dava pra prever aqui. */
export function validarNfse(c: ContextoNfse): Problema[] {
  const p: Problema[] = [];
  const erro = (campo: string, mensagem: string) => p.push({ nivel: 'erro', campo, mensagem });
  const aviso = (campo: string, mensagem: string) => p.push({ nivel: 'aviso', campo, mensagem });

  if (!c.tokenOk) erro('token', 'Configure o token da Fiscal Flow em Fiscal → Token da API.');

  const doc = c.documento.replace(/\D/g, '');
  if (!doc || !c.nome.trim()) {
    erro('tomador', 'Informe o documento e o nome do tomador da nota.');
  } else if (doc.length === 11 ? !cpfValido(doc) : doc.length === 14 ? !cnpjValido(doc) : true) {
    erro('tomador', 'O CPF/CNPJ do tomador é inválido.');
  }

  const desc = c.descricao.trim();
  if (desc.length < 10) erro('descricao', 'A descrição do serviço precisa ter pelo menos 10 caracteres.');
  if (desc.length > 2000) erro('descricao', 'A descrição do serviço passa de 2000 caracteres.');

  if (!(c.valorServico > 0)) erro('valor', 'Informe o valor do serviço (maior que zero).');

  if (c.municipioPrestacao.replace(/\D/g, '').length !== 7) {
    erro('municipio', 'Informe o município de prestação do serviço (código IBGE, 7 dígitos).');
  }

  const cod = c.codTribNac.replace(/\D/g, '');
  if (cod.length !== 6) {
    erro('codigo', 'O código de tributação nacional precisa ter 6 dígitos (ex.: 010701).');
  } else if (!NFSE_CTRIBNAC_MAP.has(cod)) {
    erro('codigo', `O código de serviço ${cod} não existe na lista nacional (a SEFIN recusaria com o erro 310). Escolha um serviço da lista.`);
  }

  const nbs = c.nbs.replace(/\D/g, '');
  if (nbs !== '' && nbs.length !== 9) erro('nbs', 'O NBS, quando informado, precisa ter 9 dígitos. Se não souber, deixe em branco.');

  if (doc && !c.tomadorTemEndereco) {
    aviso('tomador', 'O tomador está sem endereço completo (logradouro e CEP). A nota sai, mas confira o cadastro.');
  }

  if (c.ambienteHomologacao) {
    aviso('ambiente', 'Ambiente de homologação: a nota não tem validade fiscal.');
  }

  return p;
}
