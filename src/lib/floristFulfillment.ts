import { supabase } from '@/integrations/supabase/client';
import { getCompanyModules } from '@/lib/companyModulesCache';
export { buildFloralStages, isStageComplete, allStagesComplete, nextStageStatus } from '../../supabase/functions/_shared/florist-fulfillment';
export type { PersistedStage, FloralStage, StageStatus } from '../../supabase/functions/_shared/florist-fulfillment';
export interface FloralNotice { id: string; stage_id: string; event: string; status: 'queued'|'sending'|'accepted'|'failed'|'uncertain'|'skipped'; detail?: string | null; created_at: string; lease_until?: string | null }
export async function checkFloralProfile(companyId: string): Promise<boolean> {
  const modules = await getCompanyModules(companyId);
  return modules.some(m=>m.module_name==='floricultura'&&m.enabled);
}
export async function floralOrderAction(params: { companyId: string; orderId: string; action: 'confirm'|'advance'|'resume'|'retry'; stageId?: string; target?: string; noticeId?: string; confirmUncertain?: boolean }) {
  const {data,error} = await supabase.functions.invoke('florist-notifications',{body:params});
  if (error) {
    const context = error.context;
    const body = context instanceof Response ? await context.json().catch(()=>null) : null;
    throw new Error(body?.error || 'Não foi possível concluir a ação; confira o pedido antes de tentar novamente');
  }
  if (!data?.success) throw new Error(data?.error || 'Ação não concluída');
  return data as { success: true; result: { status: string; confirmedAt: string; stages: import('../../supabase/functions/_shared/florist-fulfillment').PersistedStage[] } | null; notices: FloralNotice[] };
}