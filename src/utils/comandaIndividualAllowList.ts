// Comanda individual (cartões numerados) e "mesas numeradas" — liberados para
// todas as lojas (07/10/2026). Cada loja escolhe nas Configurações de Mesas.
// O servidor (`comanda_cards_allowed`) também libera todas.
export function isComandaCardsAllowed(companyId?: string | null): boolean {
  return !!companyId;
}

export const COMANDA_CARDS_SETTING_KEY = 'comanda_cards_enabled';

/** Frações permitidas (divisões exatas, sem mexer no fiscal). */
export const COMANDA_ALLOWED_FRACTION_DENS = [2, 4, 5, 8, 10] as const;

export function isNumberedTablesAllowed(companyId?: string | null): boolean {
  return !!companyId;
}

export const NUMBERED_TABLES_SETTING_KEY = 'numbered_tables_enabled';
