import { useEffect, type ReactNode } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import { rememberLoginProfile } from '@/lib/companyProfile';

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

export function CompanyProfileTheme({ children }: { children: ReactNode }) {
  const { company } = useAuthContext();
  const { isFlorist } = useCompanyProfile(company?.id);

  useEffect(() => {
    if (company?.id) rememberLoginProfile(isFlorist);
  }, [company?.id, isFlorist]);

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

  return <>{children}</>;
}