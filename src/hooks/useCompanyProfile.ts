import { useMemo, useCallback } from 'react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { getCompanyTerminology, getCompanyProfileText, getProductionText, getSendToProductionLabel } from '@/lib/companyProfile';

export function useCompanyProfile(companyId?: string | null) {
  const { loading, isModuleEnabled } = useCompanyModules({ companyId: companyId ?? undefined });
  const isFlorist = isModuleEnabled('floricultura');
  const terminology = useMemo(() => getCompanyTerminology(isFlorist), [isFlorist]);

  const profileText = useCallback((text: string) => getCompanyProfileText(isFlorist, text), [isFlorist]);
  const productionText = useCallback((text: string) => getProductionText(isFlorist, text), [isFlorist]);
  const sendToProductionLabel = getSendToProductionLabel(isFlorist);
  return { isFlorist, terminology, profileText, productionText, sendToProductionLabel, loading };
}