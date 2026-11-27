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

/** Company remembered by this tab's hint (sessionStorage only), or null. */
export function tabHintCompanyId(): string | null {
  try { return window.ComandaTechBranding?.read()?.companyId ?? null; } catch { return null; }
}

/**
 * Look to draw while the company's modules are still loading: the florist look is kept
 * only when this tab already confirmed the same company as florist. Presentation only;
 * rules keep using the confirmed `isFlorist`.
 */
export function resolveFloristLook(
  isFlorist: boolean,
  pending: boolean,
  companyId?: string | null,
  hintCompanyId?: string | null,
): boolean {
  if (isFlorist) return true;
  return pending && !!companyId && hintCompanyId === companyId;
}
