import { useMemo, useCallback } from 'react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { getCompanyTerminology, getCompanyProfileText } from '@/lib/companyProfile';

export function useCompanyProfile(companyId?: string | null) {
  const { loading, isModuleEnabled } = useCompanyModules({ companyId: companyId ?? undefined });
  const isFlorist = isModuleEnabled('floricultura');
  const terminology = useMemo(() => getCompanyTerminology(isFlorist), [isFlorist]);

  const profileText = useCallback((text: string) => getCompanyProfileText(isFlorist, text), [isFlorist]);
  return { isFlorist, terminology, profileText, loading };
}