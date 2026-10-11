import logoIcon from '@/assets/logo-icon.png';
import floristLogo from '@/assets/logo-floricultura.png.asset.json';

export function getBrandLogo(isFlorist: boolean): string {
  return isFlorist ? floristLogo.url : logoIcon;
}
