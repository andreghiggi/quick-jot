interface TabBrand {
  companyId: string;
  path: string;
}

declare global {
  interface Window {
    ComandaTechBranding?: {
      apply: (isFlorist: boolean) => void;
      remember: (companyId: string) => void;
      clear: () => void;
      read: () => TabBrand | null;
    };
  }
}

/** Presentation only: company_modules remains the source of the authenticated profile. */
export function applyProfileBranding(isFlorist: boolean, companyId?: string) {
  if (isFlorist && companyId) window.ComandaTechBranding?.remember(companyId);
  else window.ComandaTechBranding?.clear();
  window.ComandaTechBranding?.apply(isFlorist);
}