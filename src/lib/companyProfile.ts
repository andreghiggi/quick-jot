export const FLORIST_PRIMARY_HEX = '#023c1a';
export const DEFAULT_PRIMARY_HEX = '#ef4444';

export interface CompanyTerminology {
  menu: string;
  menuLower: string;
  onlineMenu: string;
  onlineMenuLower: string;
  viewMenu: string;
  importMenu: string;
}

export function getCompanyTerminology(isFlorist: boolean): CompanyTerminology {
  return isFlorist
    ? {
        menu: 'Catálogo',
        menuLower: 'catálogo',
        onlineMenu: 'Catálogo online',
        onlineMenuLower: 'catálogo online',
        viewMenu: 'Ver catálogo',
        importMenu: 'Importar catálogo',
      }
    : {
        menu: 'Cardápio',
        menuLower: 'cardápio',
        onlineMenu: 'Cardápio online',
        onlineMenuLower: 'cardápio online',
        viewMenu: 'Ver cardápio',
        importMenu: 'Importar cardápio',
      };
}

export function getPublicMenuColor(isFlorist: boolean, savedColor?: string | null): string {
  const normalized = savedColor?.trim().toLowerCase();
  if (normalized && normalized !== DEFAULT_PRIMARY_HEX) return normalized;
  return isFlorist ? FLORIST_PRIMARY_HEX : DEFAULT_PRIMARY_HEX;
}

export function getProductTagline(isFlorist: boolean): string {
  return isFlorist ? 'Software para Floriculturas' : 'Software para Restaurantes';
}

/** Floriculturas não usam comandas, mesas nem garçons. */
export function usesTableService(isFlorist: boolean): boolean {
  return !isFlorist;
}

const LOGIN_PROFILE_KEY = 'comandatech_login_profile';

/** Perfil da tela de login: ?perfil=floricultura ou último perfil lembrado neste aparelho. */
export function getLoginIsFlorist(search: string = window.location.search): boolean {
  const param = new URLSearchParams(search).get('perfil');
  if (param === 'floricultura') return true;
  if (param === 'restaurante') return false;
  try { return localStorage.getItem(LOGIN_PROFILE_KEY) === 'floricultura'; } catch { return false; }
}

export function rememberLoginProfile(isFlorist: boolean) {
  try {
    if (isFlorist) localStorage.setItem(LOGIN_PROFILE_KEY, 'floricultura');
    else localStorage.removeItem(LOGIN_PROFILE_KEY);
  } catch { /* ignore */ }
}