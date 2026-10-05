// Comanda individual (cartões numerados) — rollout isolado.
// Espelho da tabela `comanda_cards_allowed_companies` (o servidor é quem manda).
// Não alterar sem autorização explícita.
export const COMANDA_CARDS_ALLOWED_COMPANY_IDS: string[] = [
  '8c9e7a0e-dbb6-49b9-8344-c23155a71164', // Lancheria da i9
];

export function isComandaCardsAllowed(companyId?: string | null): boolean {
  return !!companyId && COMANDA_CARDS_ALLOWED_COMPANY_IDS.includes(companyId);
}

export const COMANDA_CARDS_SETTING_KEY = 'comanda_cards_enabled';

/** Frações permitidas no piloto (divisões exatas, sem mexer no fiscal). */
export const COMANDA_ALLOWED_FRACTION_DENS = [2, 4, 5, 8, 10] as const;

// "Usar mesas numeradas" — toggle irmão do de comanda individual. Quando os
// dois estão ligados pra mesma loja, o Garçom passa a perguntar, ao clicar
// numa mesa, se é mesa normal ou comanda com cartão. Rollout isolado, só i9.
export const NUMBERED_TABLES_ALLOWED_COMPANY_IDS: string[] = [
  '8c9e7a0e-dbb6-49b9-8344-c23155a71164', // Lancheria da i9
];

export function isNumberedTablesAllowed(companyId?: string | null): boolean {
  return !!companyId && NUMBERED_TABLES_ALLOWED_COMPANY_IDS.includes(companyId);
}

export const NUMBERED_TABLES_SETTING_KEY = 'numbered_tables_enabled';
