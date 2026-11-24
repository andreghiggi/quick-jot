// Executes the actual webhook handler with isolated stores and a fake provider; never sends real messages.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = resolve('supabase/functions/whatsapp-webhook/index.ts');
let source = await readFile(sourcePath, 'utf8');
source = source.replace(/^import .*https:.*\n/gm, '').replace(/^import .*npm:.*\n/gm, '');
source = source.replace(/'\.\.\/_shared\/([^']+)'/g, (_match,file) => JSON.stringify(pathToFileURL(resolve('supabase/functions/_shared',file)).href));
source = `const serve = handler => { globalThis.__whatsappHandler = handler; };
const createClient = () => globalThis.__whatsappDb;
const corsHeaders = {'Access-Control-Allow-Origin':'*'};\n${source}`;
const compiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
const env = { EVOLUTION_API_URL: 'https://provider.invalid', EVOLUTION_API_KEY: 'fixture-evo', SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' };
globalThis.Deno = { env: { get: key => env[key] } };
await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture({ closed = false, recentHours = null, sendOk = true, florist = false } = {}) {
  const sent = [], logged = [], locks = [], filters = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://provider.invalid/message/sendText/ct-fixture');
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ status: sendOk ? 'sent' : 'failed' }), { status: sendOk ? 200 : 500 });
  };
  const db = { rpc: async () => ({ data: null, error: null }), from(table) {
    let operation = 'select', insert = null, moduleName = null;
    const query = {
      select() { return query; }, eq(column, value) { if(column==='module_name') moduleName=value; filters.push({ table, column, value }); return query; }, is() { return query; }, in() { return query; }, limit() { return query; },
      gte() { return query; }, insert(value) { operation = 'insert'; insert = value; return query; }, delete() { operation = 'delete'; return query; },
      single() { return query; }, maybeSingle() { return query; },
      then(resolvePromise, reject) {
        let data = null;
        if (operation === 'insert' && table === 'whatsapp_messages') logged.push(insert);
        else if (operation === 'insert' && table === 'whatsapp_auto_reply_locks') locks.push(insert);
        else if (operation === 'select') {
          if (table === 'whatsapp_instances') data = { company_id: 'fixture-company' };
          if (table === 'companies') data = { name: 'Loja de Teste', slug: 'fixture', subdomain: 'fixture' };
          if (table === 'company_modules') data = { enabled: moduleName === 'floricultura' ? florist : true };
          if (table === 'business_hours') data = Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, is_open: !closed, always_open: !closed, open_time: '00:00', close_time: '23:59' }));
          if (table === 'store_settings') data = [];
          if (table === 'whatsapp_messages' && recentHours !== null && recentHours < 2) data = { id: 'recent-fixture' };
        }
        return Promise.resolve({ data, error: null }).then(resolvePromise, reject);
      },
    };
    return query;
  } };
  globalThis.__whatsappDb = db;
  return { sent, logged, locks, filters };
}
function request(overrides = {}) {
  return new Request('https://database.invalid/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'messages.upsert', instance: 'ct-fixture', data: { key: { remoteJid: '5551999999999@s.whatsapp.net', fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: 'Cliente Teste', message: { ephemeralMessage: { message: { imageMessage: { caption: 'Olááá' } } } } }, ...overrides }) });
}
for (const closed of [false, true]) {
  const f = fixture({ closed });
  const response = await globalThis.__whatsappHandler(request());
  const result = await response.json();
  assert.equal(result.replied, true);
  assert.equal(result.outsideHours, closed);
  assert.equal(f.sent.length, 1);
  assert.equal(f.logged[0].status, 'sent');
}
{
  const f = fixture({ recentHours: 1 });
  const result = await (await globalThis.__whatsappHandler(request())).json();
  assert.equal(result.skipped, 'cooldown_active'); assert.equal(f.sent.length, 0);
}
{
  const f = fixture({ recentHours: 3 });
  const result = await (await globalThis.__whatsappHandler(request())).json();
  assert.equal(result.replied, true); assert.equal(f.sent.length, 1);
}
{
  const f = fixture({ sendOk: false });
  const result = await (await globalThis.__whatsappHandler(request())).json();
  assert.equal(result.ok, false); assert.equal(result.replied, false); assert.equal(f.logged[0].status, 'failed');
}
{
  fixture();
  const response = await globalThis.__whatsappHandler(request({ event: 'connection.update', data: { state: 'close' } }));
  assert.equal(response.status, 401);
}
console.log('Webhook integration: open/closed greetings, 2-hour cooldown, failed sends and unauthenticated recovery verified. No real messages sent.');

{
  const f = fixture();
  const result = await (await globalThis.__whatsappHandler(request({ data: {
    key: { remoteJid: '147656781332487@lid', remoteJidAlt: '555197170371@s.whatsapp.net', fromMe: false },
    messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: 'Boa noite' },
  } }))).json();
  assert.equal(result.replied, true);
  assert.equal(f.sent[0].number, '555197170371');
  assert.equal(f.logged[0].phone, '555197170371');
  assert.deepEqual(f.locks[0], { company_id: 'fixture-company', phone: '555197170371' });
  assert.ok(f.filters.some(x => x.table === 'whatsapp_messages' && x.column === 'phone' && x.value === '555197170371'));
}
{
  const f = fixture();
  const result = await (await globalThis.__whatsappHandler(request({ data: {
    key: { remoteJid: '147656781332487@lid', fromMe: false }, message: { conversation: 'Olá' },
  } }))).json();
  assert.equal(result.skipped, 'no_instance_or_phone');
  assert.equal(f.sent.length, 0); assert.equal(f.locks.length, 0);
}
console.log('LID integration: send destination, persisted phone, tenant lock and cooldown identity verified; absent alternate never sends.');

for (const closed of [false,true]) {
  const f=fixture({florist:true,closed});
  const result=await (await globalThis.__whatsappHandler(request())).json();
  assert.equal(result.replied,true);
  assert.equal(result.outsideHours,closed);
  assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].number,'5551999999999');
  assert.equal(f.logged[0].company_id,'fixture-company');
}
console.log('Floral greeting branch: open/closed, tenant identity and existing delivery path verified with fake provider.');
