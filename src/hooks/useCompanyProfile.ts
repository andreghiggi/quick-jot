import { useMemo, useCallback } from 'react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { getCompanyTerminology, getCompanyProfileText, getProductionText, getSendToProductionLabel } from '@/lib/companyProfile';
import { resolveFloristLook, tabHintCompanyId } from '@/lib/profileBranding';

export function useCompanyProfile(companyId?: string | null) {
  const { loading, resolved, isModuleEnabled } = useCompanyModules({ companyId: companyId ?? undefined });
  // Regras usam sempre o perfil confirmado pelos módulos da empresa.
  const isFlorist = isModuleEnabled('floricultura');
  // Só aparência: mantém o visual floral enquanto os módulos da mesma empresa carregam.
  const floristLook = resolveFloristLook(isFlorist, !!companyId && !resolved, companyId, tabHintCompanyId());
  const terminology = useMemo(() => getCompanyTerminology(floristLook), [floristLook]);

  const profileText = useCallback((text: string) => getCompanyProfileText(floristLook, text), [floristLook]);
  const productionText = useCallback((text: string) => getProductionText(floristLook, text), [floristLook]);
  const sendToProductionLabel = getSendToProductionLabel(floristLook);
  return { isFlorist, floristLook, terminology, profileText, productionText, sendToProductionLabel, loading };
}
