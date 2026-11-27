import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import { getCompanyModules } from '@/lib/companyModulesCache';
import { applyProfileBranding, tabHintCompanyId } from '@/lib/profileBranding';
import { supabase } from '@/integrations/supabase/client';
import {
  clearLegacyLoginProfile,
  getLoginIsFlorist,
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
  const { company, user, loading: authLoading, userDataReady } = useAuthContext();
  const { pathname, search } = useLocation();
  // Sem empresa logada não consulta nada: o perfil vem só do link.
  const { isFlorist: companyIsFlorist, floristLook } = useCompanyProfile(company?.id ?? null);
  // Recarregamento: enquanto a sessão ainda identifica a empresa, a indicação da aba
  // mantém o verde; fora disso vale o perfil confirmado (ou o link, no login).
  const sessionPending = authLoading || (!!user && !userDataReady);
  const isFlorist = company?.id
    ? floristLook
    : pathname === '/auth'
      ? getLoginIsFlorist(search)
      : sessionPending && !!tabHintCompanyId();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') applyProfileBranding(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useLayoutEffect(() => {
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
    if (!company?.id) {
      if (pathname === '/auth' || pathname === '/floricultura') {
        applyProfileBranding(pathname === '/floricultura' || getLoginIsFlorist(search));
      } else if (!authLoading && (!user || userDataReady)) {
        applyProfileBranding(false);
      }
      return;
    }

    // Keep the synchronous bootstrap while the company's modules are loading.
    // Ignore late results from a company that is no longer active.
    let cancelled = false;
    const companyId = company.id;
    void getCompanyModules(companyId).then((modules) => {
      if (cancelled) return;
      const florist = modules.some((module) => module.module_name === 'floricultura' && module.enabled);
      applyProfileBranding(florist, companyId);
    }).catch(() => {
      if (!cancelled) applyProfileBranding(false);
    });
    return () => { cancelled = true; };
  }, [company?.id, pathname, search, authLoading, user?.id, userDataReady, companyIsFlorist]);

  return <>{children}</>;
}
