// Execute the actual cron handler with overdue persisted rows; no real store access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let source = await readFile(resolve('supabase/functions/whatsapp-auto-heal/index.ts'), 'utf8');
source = source.replace(/^import .*https:.*\n/gm, '').replace(/^import .*npm:.*\n/gm, '');
source = source.replaceAll("'../_shared/whatsapp-recovery.ts'", JSON.stringify(pathToFileURL(resolve('supabase/functions/_shared/whatsapp-recovery.ts')).href));
source = `const createClient = () => globalThis.__db;
const corsHeaders = {'Access-Control-Allow-Origin':'*'};\n${source}`;
const env = { SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', EVOLUTION_API_URL: 'https://provider.invalid', EVOLUTION_API_KEY: 'fixture-key', SUPABASE_URL: 'https://database.invalid' };
globalThis.Deno = { env: { get: key => env[key] }, serve: handler => { globalThis.__handler = handler; } };
await import(`data:text/javascript;base64,${Buffer.from(new Bun.Transpiler({ loader: 'ts' }).transformSync(source)).toString('base64')}`);

for (const phase of ['ready', 'retry_pending', 'recovering']) {
  for (const state of ['open', 'connecting', 'close']) {
    const calls = [], claims = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, method: init?.method });
      return Response.json(url.includes('connectionState') ? { instance: { state } } : { alwaysOnline: false });
    };
    globalThis.__db = {
      rpc: async (fn, args) => { claims.push({ fn, args }); return { data: null, error: null }; },
      from(table) {
        const data = table === 'company_modules' ? { enabled: true } : [{ instance_name: 'ct-fixture', company_id: 'fixture-company', phase, attempts: 0, next_restart_at: '2020-01-01T00:00:00Z' }];
        const query = { select() { return query; }, in() { return query; }, order() { return query; }, eq() { return query; }, maybeSingle() { return query; }, then(resolvePromise, reject) { return Promise.resolve({ data, error: null }).then(resolvePromise, reject); } };
        return query;
      },
    };
    const response = await globalThis.__handler(new Request('https://database.invalid/cron', { method: 'POST', headers: { Authorization: 'Bearer fixture-service' }, body: '{}' }));
    assert.equal(response.status, 200);
    assert.equal(calls.some(x => x.url.includes('/restart/')), false);
    assert.equal(claims.some(x => x.fn === 'whatsapp_claim_restart'), state === 'close');
  }
}
console.log('Cron integration: overdue ready/retry/recovering rows never claim restarts for open/connecting; confirmed close still reaches fenced recovery.');