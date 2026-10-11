import { useMemo } from 'react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { getCompanyTerminology } from '@/lib/companyProfile';

export function useCompanyProfile(companyId?: string | null) {
  const { loading, isModuleEnabled } = useCompanyModules({ companyId: companyId ?? undefined });
  const isFlorist = isModuleEnabled('floricultura');
  const terminology = useMemo(() => getCompanyTerminology(isFlorist), [isFlorist]);

  return { isFlorist, terminology, loading };
}