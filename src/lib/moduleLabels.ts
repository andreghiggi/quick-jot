// Rótulos curtos usados em badges/listagens (painel do revendedor, dashboard).
// Rótulos completos vivem em src/components/admin/CompanyModulesControl.tsx.

export const MODULE_SHORT_LABEL: Record<string, string> = {
  pdv: 'PDV V1',
  pdv_v2: 'PDV V2',
  mesas: 'Mesas',
  whatsapp: 'WhatsApp',
  fiscal: 'NFC-e',
  nfe: 'NF-e',
  sales_campaigns: 'Campanhas',
  cardapio_mesa: 'QR Mesa',
  mercado: 'Loja',
  cardapio: 'Cardápio',
  financeiro: 'Financeiro',
};

export function moduleShortLabel(name: string): string {
  return MODULE_SHORT_LABEL[name] || name;
}