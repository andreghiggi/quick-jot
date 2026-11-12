// Porta Deno-compatível de src/utils/nfceItemFiscal.ts (buildNfceFiscalFields),
// usada só pelo nfce-contingencia-sync para montar o item fiscal de vendas
// que ficaram sem tentativa de emissão (venda com fiscal_mode='fiscal' mas
// nenhum nfce_records criado). Mesma lógica do frontend, não reinventada.
export interface NfceFiscalFields {
  ncm: string
  cfop: string
  cest?: string
  csosn: string
  aliquota_icms: number
  cst_pis: string
  aliquota_pis: number
  cst_cofins: string
  aliquota_cofins: number
}

export interface BuildNfceFiscalFieldsInput {
  product?: { ncm?: string | null; cest?: string | null } | null
  taxRule?: {
    ncm?: string | null
    cfop?: string | null
    cest?: string | null
    csosn?: string | null
    icms_aliquot?: number | null
    pis_cst?: string | null
    pis_aliquot?: number | null
    cofins_cst?: string | null
    cofins_aliquot?: number | null
  } | null
  mercadoEnabled?: boolean
  fallbackNcm?: string
  fallbackCfop?: string
}

const clean = (v?: string | null) => (typeof v === 'string' ? v.trim() : '')

export function buildNfceFiscalFields(opts: BuildNfceFiscalFieldsInput): NfceFiscalFields {
  const {
    product,
    taxRule,
    mercadoEnabled = false,
    fallbackNcm = '00000000',
    fallbackCfop = '5102',
  } = opts

  const prodNcm = mercadoEnabled ? clean(product?.ncm) : ''
  const prodCest = mercadoEnabled ? clean(product?.cest) : ''

  const ncm = prodNcm || clean(taxRule?.ncm) || fallbackNcm
  const cfop = clean(taxRule?.cfop) || fallbackCfop
  const cest = prodCest || clean(taxRule?.cest) || ''

  return {
    ncm,
    cfop,
    ...(cest ? { cest } : {}),
    csosn: taxRule?.csosn || '102',
    aliquota_icms: taxRule?.icms_aliquot ?? 0,
    cst_pis: taxRule?.pis_cst || '49',
    aliquota_pis: taxRule?.pis_aliquot ?? 0,
    cst_cofins: taxRule?.cofins_cst || '49',
    aliquota_cofins: taxRule?.cofins_aliquot ?? 0,
  }
}
