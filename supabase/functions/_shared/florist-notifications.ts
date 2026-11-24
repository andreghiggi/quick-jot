import { evoServerForCompany } from './evolution-server.ts';
import { formatFloralNotice, FLORAL_TEMPLATES } from './florist-messages.ts';

export async function floristProfileEnabled(db: any, companyId: string): Promise<boolean> {
  const { data, error } = await db.from('company_modules').select('enabled').eq('company_id',companyId).eq('module_name','floricultura').maybeSingle();
  if (error) throw new Error('Não foi possível verificar o perfil da loja');
  return data?.enabled === true;
}
export async function dispatchFloralNotices(db: any, companyId: string, orderId: string) {
  // One persisted lease per order; no greeting cooldown, no session restarts.
  for (let i = 0; i < 10; i++) {
    const { data: notice, error: claimError } = await db.rpc('florist_claim_notice',{_company:companyId,_order:orderId});
    if (claimError) throw new Error('Não foi possível reservar a mensagem');
    if (!notice) break;
    const finish = async (status: string, detail?: string) => {
      const { error } = await db.rpc('florist_finish_notice',{_id:notice.id,_token:notice.lease_token,_status:status,_detail:detail || null});
      if (error) throw new Error('Não foi possível registrar o resultado da mensagem');
    };
    let attempted = false;
    try {
      const [orderRes, itemsRes, companyRes, hoursRes, settingsRes, moduleRes, instanceRes] = await Promise.all([
        db.from('orders').select('id,customer_name,customer_phone,short_code,total,created_at,delivery_address,florist_fulfillments,status,notes').eq('company_id',companyId).eq('id',orderId).single(),
        db.from('order_items').select('id,name,quantity,notes').eq('company_id',companyId).eq('order_id',orderId),
        db.from('companies').select('name,address,address_street,address_number,address_complement,address_neighborhood,slug,subdomain').eq('id',companyId).single(),
        db.from('business_hours').select('*').eq('company_id',companyId),
        db.from('store_settings').select('key,value').eq('company_id',companyId).in('key',['google_review_url',...FLORAL_TEMPLATES.map(t=>t.settingKey)]),
        db.from('company_modules').select('enabled').eq('company_id',companyId).eq('module_name','whatsapp').maybeSingle(),
        db.from('whatsapp_instances').select('instance_name,status').eq('company_id',companyId).maybeSingle(),
      ]);
      if ([orderRes,itemsRes,companyRes,hoursRes,settingsRes,moduleRes,instanceRes].some(r=>r.error)) throw new Error('Falha ao consultar os dados da mensagem');
      const o = orderRes.data, c = companyRes.data;
      if (!o || !c) throw new Error('Pedido ou loja não encontrado');
      if (o.status === 'canceled' || o.notes?.includes('[CANCELADA]')) { await finish('skipped','Pedido cancelado'); continue; }
      if (!moduleRes.data?.enabled || !instanceRes.data) throw new Error('WhatsApp não habilitado ou sem conexão cadastrada');
      const phone = (o.customer_phone || '').replace(/\D/g,'');
      if (!/^\d{10,13}$/.test(phone)) throw new Error('Telefone do comprador não informado ou inválido');
      const number = phone.length === 10 || phone.length === 11 ? `55${phone}` : phone;
      const custom: Record<string,string> = Object.fromEntries((settingsRes.data || []).map((s: any)=>[s.key,s.value || '']));
      const menuUrl = c.subdomain ? `https://${c.subdomain}.comandatech.com.br` : `https://app.comandatech.com.br/cardapio/${c.slug}`;
      const address = c.address || [c.address_street,c.address_number,c.address_complement,c.address_neighborhood].filter(Boolean).join(', ');
      const text = formatFloralNotice(notice.event,{ items:itemsRes.data || [],createdAt:o.created_at,customerName:o.customer_name,
        shortCode:o.short_code,total:Number(o.total),deliveryAddress:o.delivery_address,stages:o.florist_fulfillments },
        {storeName:c.name,storeAddress:address || 'consulte a loja',menuUrl,reviewUrl:custom.google_review_url,hours:hoursRes.data || [],custom},notice.stage_id);
      if (!text) throw new Error('Mensagem não configurada');
      const server = await evoServerForCompany(db,companyId);
      if (!server) throw new Error('Serviço de WhatsApp não configurado');
      const base = server.url.replace(/\/$/,'');
      const stateRes = await fetch(`${base}/instance/connectionState/${encodeURIComponent(instanceRes.data.instance_name)}`,{headers:{apikey:server.key},signal:AbortSignal.timeout(5000)});
      if (!stateRes.ok || (await stateRes.json())?.instance?.state !== 'open') throw new Error('WhatsApp desconectado; a etapa foi salva e a mensagem está pendente');
      attempted = true;
      const sent = await fetch(`${base}/message/sendText/${encodeURIComponent(instanceRes.data.instance_name)}`,{
        method:'POST',headers:{'Content-Type':'application/json',apikey:server.key},body:JSON.stringify({number,text,linkPreview:false}),signal:AbortSignal.timeout(8000),
      });
      const payload = await sent.json().catch(()=>null);
      if (!sent.ok || payload?.success === false || payload?.error) {
        await finish('failed',`Serviço de WhatsApp recusou o envio (HTTP ${sent.status})`); break;
      }
      if (!payload) { await finish('uncertain','Serviço respondeu sem resultado válido; confira o WhatsApp antes de reenviar'); break; }
      await finish('accepted','Aceita pelo serviço de WhatsApp; entrega ao celular não confirmada');
      await db.from('whatsapp_messages').insert({company_id:companyId,order_id:orderId,phone:number,message:text,status:'sent'});
    } catch (error) {
      await finish(attempted ? 'uncertain' : 'failed',attempted ? 'Resultado de envio incerto; confira o WhatsApp antes de reenviar' : error instanceof Error ? error.message : 'Não foi possível preparar a mensagem');
      break;
    }
  }
  const { data, error } = await db.from('florist_notifications').select('id,stage_id,event,status,detail,created_at,lease_until').eq('company_id',companyId).eq('order_id',orderId).order('created_at');
  if (error) throw new Error('Não foi possível consultar os resultados das mensagens');
  return data || [];
}