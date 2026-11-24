import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.119.2/cors';
import { z } from 'npm:zod@3';
import { dispatchFloralNotices, floristProfileEnabled } from '../_shared/florist-notifications.ts';

const schema = z.object({companyId:z.string().uuid(),orderId:z.string().uuid(),action:z.enum(['confirm','advance','resume','retry']),
  stageId:z.string().max(80).optional(),target:z.enum(['ready_for_pickup','out_for_delivery','delivered','picked_up']).optional(),
  noticeId:z.string().uuid().optional(),confirmUncertain:z.boolean().optional()});
const response = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
  if (req.method !== 'POST') return response({error:'Método não permitido'},405);
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i,'');
    const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !key) return response({error:'Serviço não configurado'},503);
    const staff = createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const {data:user,error:authError} = await staff.auth.getUser(token);
    if (authError || !user?.user) return response({error:'Sessão inválida'},401);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return response({error:'Dados da remessa inválidos'},400);
    const p = parsed.data;
    const {data:allowed,error:accessError} = await staff.rpc('florist_can_manage',{_company:p.companyId});
    if (accessError || !allowed) return response({error:'Sem acesso a esta loja'},403);
    const db = createClient(url,key);
    if (!await floristProfileEnabled(db,p.companyId)) return response({error:'Perfil floricultura não ativo'},403);
    const {data:order,error:orderError} = await db.from('orders').select('id,status,notes').eq('company_id',p.companyId).eq('id',p.orderId).single();
    if (orderError || !order) return response({error:'Pedido não encontrado'},404);
    if (order.status === 'canceled' || order.notes?.includes('[CANCELADA]')) return response({error:'Pedido cancelado'},409);
    let result = null;
    if (p.action === 'confirm' || p.action === 'advance') {
      if (p.action === 'advance' && (!p.stageId || !p.target)) return response({error:'Informe a remessa e a ação'},400);
      const transition = await staff.rpc('florist_transition',{_company:p.companyId,_order:p.orderId,_stage:p.stageId || null,_target:p.action==='confirm'?'confirm':p.target});
      if (transition.error) return response({error:transition.error.message},409);
      result = transition.data;
    }
    if (p.action === 'retry') {
      if (!p.noticeId) return response({error:'Mensagem não informada'},400);
      const states = p.confirmUncertain ? ['failed','uncertain'] : ['failed'];
      const {error} = await db.from('florist_notifications').update({status:'queued',detail:null})
        .eq('company_id',p.companyId).eq('order_id',p.orderId).eq('id',p.noticeId).in('status',states);
      if (error) return response({error:'Não foi possível reabrir a mensagem'},409);
    }
    const notices = await dispatchFloralNotices(db,p.companyId,p.orderId);
    return response({success:true,result,notices});
  } catch { return response({error:'Não foi possível concluir a solicitação; confira a etapa salva antes de tentar novamente'},500); }
});