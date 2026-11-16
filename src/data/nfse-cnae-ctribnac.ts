/**
 * Sugestão de Código de Tributação Nacional (c_trib_nac) por CNAE da empresa.
 *
 * Não existe crosswalk oficial 1:1 entre CNAE e a lista nacional de serviços
 * da NFS-e (são classificações diferentes) -- isto é uma curadoria manual dos
 * casos mais comuns, só para pré-sugerir no formulário. A busca livre em
 * `NFSE_CTRIBNAC` continua funcionando para qualquer código fora desta lista.
 *
 * Chave: CNAE sem formatação (7 dígitos). Adicione novos CNAEs conforme
 * forem aparecendo empresas com esse ramo.
 */
export const NFSE_CTRIBNAC_POR_CNAE: Record<string, string[]> = {
  // Atividades paisagísticas
  '8130300': ['070106', '071102', '071001'],
};
