import type { Product } from '@/types/product';
import type { TaxRule } from '@/hooks/useTaxRules';

/**
 * Monta os campos fiscais (ncm/cfop/cest + tributos) de um item de NFC-e.
 *
 * Regra (Mercado / Frente de Caixa):
 *  - `ncm`, `cfop`, `cest` podem vir do cadastro do produto. Quando vazios,
 *    cai para a regra tributária. Quando nem produto nem regra trazem nada,
 *    usa o fallback (NCM '00000000' / CFOP '5102').
 *  - `cest` só é incluído quando preenchido (XML opcional).
 *  - Demais campos (CSOSN, alíquotas, CSTs) SEMPRE vêm da regra tributária.
 *
 * Quando `mercadoEnabled` é `false`, os campos do produto são ignorados —
 * comportamento idêntico ao anterior à Fase C.
 */
export interface NfceFiscalFields {
  ncm: string;
  cfop: string;
  cest?: string;
  csosn: string;
  aliquota_icms: number;
  cst_pis: string;
  aliquota_pis: number;
  cst_cofins: string;
  aliquota_cofins: number;
}

export interface BuildNfceFiscalOptions {
  product?: Pick<Product, 'ncm' | 'cfop' | 'cest'> | null;
  taxRule?: Pick<
    TaxRule,
    | 'ncm'
    | 'cfop'
    | 'cest'
    | 'csosn'
    | 'icms_aliquot'
    | 'pis_cst'
    | 'pis_aliquot'
    | 'cofins_cst'
    | 'cofins_aliquot'
  > | null;
  mercadoEnabled?: boolean;
  /** NCM default quando produto e regra estiverem vazios. Default: '00000000'. */
  fallbackNcm?: string;
  /** CFOP default quando produto e regra estiverem vazios. Default: '5102'. */
  fallbackCfop?: string;
}

const clean = (v?: string | null) => (typeof v === 'string' ? v.trim() : '');

export function buildNfceFiscalFields(opts: BuildNfceFiscalOptions): NfceFiscalFields {
  const {
    product,
    taxRule,
    mercadoEnabled = false,
    fallbackNcm = '00000000',
    fallbackCfop = '5102',
  } = opts;

  const prodNcm = mercadoEnabled ? clean(product?.ncm) : '';
  const prodCfop = mercadoEnabled ? clean(product?.cfop) : '';
  const prodCest = mercadoEnabled ? clean(product?.cest) : '';

  const ncm = prodNcm || clean(taxRule?.ncm) || fallbackNcm;
  const cfop = prodCfop || clean(taxRule?.cfop) || fallbackCfop;
  const cest = prodCest || clean(taxRule?.cest) || '';

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
  };
}