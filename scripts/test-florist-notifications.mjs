// Actual notification dispatcher and endpoint, isolated in memory with a fictitious provider.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const env={SUPABASE_URL:'https://database.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',EVOLUTION_API_URL:'https://provider.invalid',EVOLUTION_API_KEY:'fixture-provider'};
globalThis.Deno={env:{get:key=>env[key]}};
const {dispatchFloralNotices}=await import('../supabase/functions/_shared/florist-notifications.ts');
const companyId='00000000-0000-0000-0000-000000000011',orderId='00000000-0000-0000-0000-000000000100';
function fixture({failure=false,timeout=false,connected=true,florist=true}={}) {
  const sent=[],logs=[],filters=[],notices=[{id:'00000000-0000-0000-0000-000000000301',company_id:companyId,order_id:orderId,event:'confirmed',stage_id:'',status:'queued',created_at:new Date().toISOString()}];
  const items=[{id:'a',name:'Buquê',quantity:1,notes:'DESTINO 1: PRESENTE | Entrega 10/12/2026 09:00–12:00 | Recebe: Maria (51988887766) | Endereço: Rua A, 1 - Centro'},
    {id:'b',name:'Vaso de Suculenta',quantity:1,notes:'DESTINO 2: Para o comprador | Retirada na loja'}];
  const order={id:orderId,customer_name:'João Comprador',customer_phone:'51999991111',short_code:'D-005',total:180,created_at:new Date().toISOString(),florist_fulfillments:[],status:'pending'};
  const db={auth:{getUser:async token=>({data:{user:token==='fixture-session'?{id:'fixture-user'}:null},error:token==='fixture-session'?null:{message:'invalid'}})},
    async rpc(name,p){
      if(name==='florist_can_manage')return {data:p._company===companyId,error:null};
      if(name==='florist_transition'){
        assert.equal(p._company,companyId);assert.equal(p._order,orderId);
        if(p._target!=='confirm')notices.push({id:'00000000-0000-0000-0000-000000000302',event:p._target,stage_id:p._stage,status:'queued'});
        order.confirmed_at=new Date().toISOString();
        return {data:{status:'pending',confirmedAt:order.confirmed_at,stages:[]},error:null};
      }
      if(name==='florist_claim_notice'){
        assert.equal(p._company,companyId);assert.equal(p._order,orderId);
        const n=notices.find(n=>!['accepted','skipped'].includes(n.status));
        if(!n||n.status!=='queued')return {data:null,error:null};
        n.status='sending';n.lease_token='fixture-lease';return {data:{...n},error:null};
      }
      if(name==='florist_finish_notice'){
        const n=notices.find(n=>n.id===p._id);assert.equal(p._token,'fixture-lease');n.status=p._status;n.detail=p._detail;return {data:null,error:null};
      }
      throw new Error(name);
    },
    from(table){let filter={},op='select',value=null;const q={select(){return q;},eq(k,v){filter[k]=v;filters.push({table,k,v});return q;},in(){return q;},single(){return q;},maybeSingle(){return q;},order(){return q;},update(v){op='update';value=v;return q;},insert(v){op='insert';value=v;return q;},
      then(resolvePromise,reject){
        let data=null;
        if(op==='select'){
          if(table==='company_modules')data={enabled:filter.module_name==='floricultura'?florist:true};
          if(table==='orders')data=filter.company_id===companyId?order:null;
          if(table==='order_items')data=items;
          if(table==='companies')data={name:'Flores Teste',address:'Rua da Loja, 123',slug:'fixture'};
          if(table==='business_hours')data=[];
          if(table==='store_settings')data=[{key:'google_review_url',value:'https://reviews.invalid/fixture'}];
          if(table==='whatsapp_instances')data={instance_name:'ct-fixture',status:'connected'};
          if(table==='florist_notifications')data=notices;
        } else if(table==='whatsapp_messages')logs.push(value);
        return Promise.resolve({data,error:null}).then(resolvePromise,reject);
      }};return q;}
  };
  globalThis.fetch=async(url,init)=>{
    if(url.includes('/instance/connectionState/'))return new Response(JSON.stringify({instance:{state:connected?'open':'close'}}));
    assert.equal(url,'https://provider.invalid/message/sendText/ct-fixture');sent.push(JSON.parse(init.body));
    if(timeout)throw new DOMException('Timed out','TimeoutError');
    return new Response(JSON.stringify({success:!failure}),{status:failure?500:200});
  };
  globalThis.__floralDb=db;return {db,sent,logs,notices,filters};
}
{
  const f=fixture();await dispatchFloralNotices(f.db,companyId,orderId);
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].number,'5551999991111');
  assert.equal(f.notices[0].status,'accepted');assert.equal(f.logs[0].order_id,orderId);
  await dispatchFloralNotices(f.db,companyId,orderId);assert.equal(f.sent.length,1);
  assert.ok(f.filters.filter(f=>['orders','order_items','companies','business_hours','store_settings','whatsapp_instances'].includes(f.table)).some(f=>f.k==='company_id'&&f.v===companyId));
}
for(const options of [{failure:true},{timeout:true},{connected:false}]){
  const f=fixture(options);await dispatchFloralNotices(f.db,companyId,orderId);
  assert.equal(f.notices[0].status,options.timeout?'uncertain':'failed');
  await dispatchFloralNotices(f.db,companyId,orderId);assert.equal(f.sent.length,options.connected===false?0:1);
  assert.equal(f.logs.length,0);
}
let source=await readFile(resolve('supabase/functions/florist-notifications/index.ts'),'utf8');
source=source.replace(/^import .*https:.*\n/gm,'').replace(/^import .*npm:.*\n/gm,'');
source=source.replace(/'\.\.\/_shared\/([^']+)'/g,(_m,file)=>JSON.stringify(pathToFileURL(resolve('supabase/functions/_shared',file)).href));
source=`import {z} from ${JSON.stringify(pathToFileURL(Bun.resolveSync('zod',process.cwd())).href)}; const serve=h=>globalThis.__floralHandler=h;const createClient=()=>globalThis.__floralDb;const corsHeaders={};\n${source}`;
const compiled=new Bun.Transpiler({loader:'ts'}).transformSync(source);
await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const request=(body,token='fixture-session')=>new Request('https://database.invalid/functions/florist-notifications',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
{
  const f=fixture();const result=await globalThis.__floralHandler(request({companyId,orderId,action:'confirm'}));
  assert.equal(result.status,200);assert.equal((await result.json()).success,true);assert.equal(f.sent[0].number,'5551999991111');
  const result2=await globalThis.__floralHandler(request({companyId,orderId,action:'advance',stageId:'destino-2',target:'ready_for_pickup'}));
  assert.equal(result2.status,200);assert.equal(f.sent.length,2);assert.equal(f.sent[1].number,'5551999991111');
  assert.equal(f.logs[1].order_id,orderId); // Same-day transactional updates are not blocked by greeting cooldown.
}
{
  const f=fixture();assert.equal((await globalThis.__floralHandler(request({companyId,orderId,action:'confirm'},'invalid'))).status,401);assert.equal(f.sent.length,0);
  assert.equal((await globalThis.__floralHandler(request({companyId:'00000000-0000-0000-0000-000000000022',orderId,action:'confirm'}))).status,403);
  assert.equal(f.sent.length,0);
}
{
  const f=fixture({florist:false});assert.equal((await globalThis.__floralHandler(request({companyId,orderId,action:'confirm'}))).status,403);assert.equal(f.sent.length,0);
}
console.log('Floral handler: buyer-only sends, tenant access, restaurant rejection, same-day statuses, success deduplication, disconnected/failed/uncertain outcomes verified. No real messages.');