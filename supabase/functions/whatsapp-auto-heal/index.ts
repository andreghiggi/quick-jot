import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { evolutionRequest, recoverInstance, restoreConfiguration } from '../_shared/whatsapp-recovery.ts';

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // The host cron authenticates; anonymous requests must never restart stores.
  if (!serviceKey || req.headers.get('Authorization') !== `Bearer ${serviceKey}`) return json(401, { error: 'Unauthorized' });
  const evoUrl = Deno.env.get('EVOLUTION_API_URL');
  const evoKey = Deno.env.get('EVOLUTION_API_KEY');
  const dbUrl = Deno.env.get('SUPABASE_URL');
  if (!evoUrl || !evoKey || !dbUrl) return json(500, { error: 'Not configured' });
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return json(400, { error: 'Expected empty object' });
    const db = createClient(dbUrl, serviceKey);
    const { data: rows, error } = await db.from('whatsapp_recovery').select('*')
      .in('phase', ['ready', 'retry_pending', 'recovering']).order('next_restart_at');
    if (error) return json(503, { error: 'Recovery migration unavailable' });
    const call = evolutionRequest(evoUrl, evoKey);
    const webhookUrl = `${dbUrl}/functions/v1/whatsapp-webhook`;
    // Restarts are serialized and staggered; full configuration repair stays at 10 minutes.
    const repair = Math.floor(Date.now() / 60000) % 10 === 0;
    const results: Record<string, string> = {};
    const deadline = Date.now() + 45000;
    const sorted = (rows || []).sort((a, b) => Number(b.phase !== 'ready') - Number(a.phase !== 'ready'));
    for (const row of sorted) {
      if (Date.now() > deadline) break;
      const name = row.instance_name;
      if (!/^ct-[a-zA-Z0-9-]+$/.test(name)) continue;
      if (row.lease_until && Date.parse(row.lease_until) > Date.now()) continue;
      if (row.phase === 'recovering' && row.attempts >= 2) {
        await db.from('whatsapp_recovery').update({ phase: 'blocked', detail: 'Duas tentativas interrompidas; recuperação automática bloqueada. Verificar sessão/QR.', checked_at: new Date().toISOString() })
          .eq('instance_name', name).eq('company_id', row.company_id).eq('lease_token', row.lease_token);
        continue;
      }
      const { data: module } = await db.from('company_modules').select('enabled')
        .eq('company_id', row.company_id).eq('module_name', 'whatsapp').maybeSingle();
      if (!module?.enabled) continue;
      try {
        const state = await call(`/instance/connectionState/${name}`);
        const closed = state?.instance?.state === 'close';
        if (closed && row.phase === 'ready') await db.rpc('whatsapp_observe_connection', {
          _name: name, _company: row.company_id, _state: 'close', _logged_out: false,
        });
        const due = Date.parse(row.next_restart_at) <= Date.now();
        if (closed || row.phase !== 'ready' || due) {
          const result = await recoverInstance(db, call, name, row.company_id, webhookUrl);
          results[name] = result.skipped ? 'deferred' : result.success ? 'reconnected_not_receipt_verified' : 'recovery_failed';
          // One restart per invocation, plus global database lease across webhook/manual calls.
          if (!result.skipped) break;
        } else if (repair && state?.instance?.state === 'open') {
          await restoreConfiguration(call, name, webhookUrl);
          results[name] = 'configuration_repaired';
        }
      } catch { results[name] = 'provider_unavailable'; }
    }
    console.log('[whatsapp-auto-heal]', JSON.stringify(results));
    return json(200, { ok: true, results });
  } catch { return json(500, { error: 'Recovery check failed' }); }
});
