/**
 * Serviço padrão da NFS-e por segmento da empresa.
 *
 * Serve só para pré-preencher a tela de emissão (tudo continua editável). A ordem de
 * prioridade na tela é: padrão salvo pela própria empresa > CNAE > nome da empresa.
 *
 * Os códigos são da lista nacional de serviços (NFSE_CTRIBNAC). Floricultura: a venda de
 * flores/plantas é mercadoria (NF-e/NFC-e); a NFS-e entra quando há serviço, como a
 * montagem/decoração com arranjos (07.11 Decoração), jardinagem (07.11 Jardinagem) ou
 * paisagismo (07.01).
 */
export type ServicoPadrao = {
  rotulo: string;
  cTribNac: string;
  discriminacao: string;
  /** Outros códigos comuns do segmento, mostrados como atalhos. */
  alternativos: string[];
};

const FLORICULTURA: ServicoPadrao = {
  rotulo: 'Floricultura',
  cTribNac: '071101',
  discriminacao: 'Serviço de decoração com arranjos florais e plantas.',
  alternativos: ['071102', '070106'],
};

const PAISAGISMO: ServicoPadrao = {
  rotulo: 'Paisagismo e jardinagem',
  cTribNac: '070106',
  discriminacao: 'Serviço de paisagismo e jardinagem.',
  alternativos: ['071102', '071101'],
};

/** CNAE (7 dígitos, sem formatação) -> serviço padrão. */
const POR_CNAE: Record<string, ServicoPadrao> = {
  '4789002': FLORICULTURA, // Comércio varejista de plantas e flores naturais
  '8130300': PAISAGISMO, // Atividades paisagísticas
};

/** Palavras do nome da empresa que indicam o segmento (quando não há CNAE). */
const POR_NOME: Array<[RegExp, ServicoPadrao]> = [
  [/flor|florist|floricultura|garden|jardim/i, FLORICULTURA],
  [/paisag/i, PAISAGISMO],
];

export function sugerirServicoPadrao(opts: { cnae?: string | null; nomeEmpresa?: string | null }): ServicoPadrao | null {
  const cnae = (opts.cnae || '').replace(/\D/g, '');
  if (cnae && POR_CNAE[cnae]) return POR_CNAE[cnae];
  const nome = (opts.nomeEmpresa || '').trim();
  if (nome) {
    for (const [re, servico] of POR_NOME) if (re.test(nome)) return servico;
  }
  return null;
}
