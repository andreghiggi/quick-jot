import logoIcon from '@/assets/logo-icon.png';
import floristLogo from '@/assets/logo-floricultura.png';

export function getBrandLogo(isFlorist: boolean): string {
  return isFlorist ? floristLogo : logoIcon;
}
