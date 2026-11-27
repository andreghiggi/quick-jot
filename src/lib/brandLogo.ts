import logoIcon from '@/assets/logo-icon.png';
import floristLogo from '@/assets/logo-floricultura.png';

export function getBrandLogo(isFlorist: boolean): string {
  return isFlorist ? floristLogo : logoIcon;
}

/** Mantém o favicon tradicional dos restaurantes e usa a marca verde só no perfil floral. */
export function getBrandFavicon(isFlorist: boolean): string {
  return isFlorist ? floristLogo : '/favicon.png';
}
