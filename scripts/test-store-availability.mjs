// Real QR handler with an isolated database; never creates a live tab or sends a message.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { storeLocalDate } from '../supabase/functions/_shared/store-availability.ts';
let source = await readFile('supabase/functions/mesa-public/index.ts','utf8');
source=source.replace(/^import .*https:.*\n/gm,'').replace(/'\.\.\/_shared\/([^']+)'/g,(_m,file)=>JSON.stringify(pathToFileURL(resolve('supabase/functions/_shared',file)).href));
source=`const createClient=()=>globalThis.__storeDb;\n${source}`;
globalThis.Deno={env:{get:()=> 'fixture'},serve:handler=>{globalThis.__storeHandler=handler;}};
await import(`data:text/javascript;base64,${Buffer.from(new Bun.Transpiler({loader:'ts'}).transformSync(source)).toString('base64')}`);
function fixture(value,error=null){
 const writes=[],filters=[];
 globalThis.__storeDb={rpc:async()=>({data:false,error:null}),from(table){
  const q={select:()=>q,eq:(key,v)=>{filters.push([table,key,v]);return q;},insert:v=>{writes.push([table,v]);return q;},maybeSingle:()=>Promise.resolve(table==='company_modules'?{data:{enabled:true},error:null}:table==='store_settings'?{data:value?{value}:null,error}:{data:null,error:null})};
  return q;
 }};
 return {writes,filters};
}
const request=()=>new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({action:'submit-order',companyId:'tenant-a',tableNumber:1,items:[{productId:'p',quantity:1,unitPrice:15}]})});
{
 const f=fixture(JSON.stringify({mode:'closed',date:storeLocalDate()}));
 const response=await globalThis.__storeHandler(request());
 assert.equal(response.status,409);
 assert.equal((await response.json()).error,'store_closed');
 assert.equal(f.writes.length,0);
 assert.ok(f.filters.some(([t,k,v])=>t==='store_settings'&&k==='company_id'&&v==='tenant-a'));
}
for(const value of [null,JSON.stringify({mode:'open',date:storeLocalDate()}),JSON.stringify({mode:'closed',date:'2020-01-01'})]){
 const f=fixture(value);
 const response=await globalThis.__storeHandler(request());
 assert.equal((await response.json()).error,'table_not_found'); // Passed availability gate into existing table validation.
 assert.equal(f.writes.length,0);
}
{
 const f=fixture(null,{message:'unavailable'});
 const response=await globalThis.__storeHandler(request());
 assert.equal(response.status,500);
 assert.equal(f.writes.length,0);
}
console.log('QR handler: current closure blocks before any tab/item write; open, absent and expired overrides preserve existing validation; read errors fail closed. No real changes.');