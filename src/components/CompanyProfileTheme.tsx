import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import { getBrandFavicon } from '@/lib/brandLogo';
import {
  clearLegacyLoginProfile,
  FLORIST_PRIMARY_HEX,
  getLoginIsFlorist,
  getProductDescription,
  getProductTagline,
} from '@/lib/companyProfile';

const FLORIST_THEME: Record<string, string> = {
  '--primary': '145 94% 12%',
  '--primary-foreground': '0 0% 100%',
  '--ring': '145 94% 12%',
  '--accent': '145 55% 94%',
  '--accent-foreground': '145 94% 12%',
  '--sidebar-primary': '145 94% 12%',
  '--sidebar-primary-foreground': '0 0% 100%',
  '--sidebar-accent': '145 55% 94%',
  '--sidebar-accent-foreground': '145 94% 12%',
  '--sidebar-ring': '145 94% 12%',
  '--gradient-primary': 'linear-gradient(135deg, hsl(145 94% 12%) 0%, hsl(145 72% 28%) 100%)',
  '--gradient-hero': 'linear-gradient(135deg, hsl(145 94% 12% / 0.1) 0%, hsl(0 0% 98%) 100%)',
  '--shadow-primary': '0 4px 14px -3px hsl(145 94% 12% / 0.4)',
};

// Limpa a memória antiga que deixava o login verde para todas as lojas.
clearLegacyLoginProfile();

export function CompanyProfileTheme({ children }: { children: ReactNode }) {
  const { company } = useAuthContext();
  const { pathname, search } = useLocation();
  // Sem empresa logada não consulta nada: o perfil vem só do link.
  const { isFlorist: companyIsFlorist } = useCompanyProfile(company?.id ?? null);
  const isFlorist = company?.id
    ? companyIsFlorist
    : pathname === '/auth' && getLoginIsFlorist(search);

  useEffect(() => {
    if (!isFlorist) return;
    const root = document.documentElement;
    const previous = new Map<string, string>();
    Object.entries(FLORIST_THEME).forEach(([property, value]) => {
      previous.set(property, root.style.getPropertyValue(property));
      root.style.setProperty(property, value);
    });
    root.dataset.companyProfile = 'floricultura';

    return () => {
      Object.keys(FLORIST_THEME).forEach((property) => {
        const oldValue = previous.get(property);
        if (oldValue) root.style.setProperty(property, oldValue);
        else root.style.removeProperty(property);
      });
      delete root.dataset.companyProfile;
    };
  }, [isFlorist]);

  useEffect(() => {
    if (!isFlorist) return;

    const descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previous = {
      title: document.title,
      description: descriptionMeta?.content,
      faviconHref: favicon?.getAttribute('href'),
      faviconType: favicon?.getAttribute('type'),
      themeColor: themeColor?.content,
    };

    document.title = `ComandaTech - ${getProductTagline(true)}`;
    if (descriptionMeta) descriptionMeta.content = getProductDescription(true);
    if (favicon) {
      favicon.type = 'image/png';
      favicon.href = getBrandFavicon(true);
    }
    if (themeColor) themeColor.content = FLORIST_PRIMARY_HEX;

    return () => {
      document.title = previous.title;
      if (descriptionMeta && previous.description !== undefined) {
        descriptionMeta.content = previous.description;
      }
      if (favicon) {
        if (previous.faviconHref) favicon.setAttribute('href', previous.faviconHref);
        else favicon.removeAttribute('href');
        if (previous.faviconType) favicon.setAttribute('type', previous.faviconType);
        else favicon.removeAttribute('type');
      }
      if (themeColor && previous.themeColor !== undefined) {
        themeColor.content = previous.themeColor;
      }
    };
  }, [isFlorist]);

  return <>{children}</>;
}
