// Auto-healer do WhatsApp: a cada execução (cron) reaplica o webhook e força
// alwaysOnline=false em todas as instâncias ComandaTech conectadas.
// Operações idempotentes; não desloga, não reinicia e não envia mensagens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const EVO_URL = Deno.env.get('EVOLUTION_API_URL');
  const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY');
  if (!EVO_URL || !EVO_KEY) return json(500, { error: 'Evolution API not configured' });
  const baseUrl = EVO_URL.replace(/\/$/, '');
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/whatsapp-webhook`;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: rows } = await supabase
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('status', 'connected')
    .like('instance_name', 'ct-%');

  const results: Record<string, string> = {};
  for (const { instance_name: name } of rows ?? []) {
    try {
      const st = await (await fetch(`${baseUrl}/instance/connectionState/${name}`, { headers: { apikey: EVO_KEY } })).json().catch(() => null);
      if (st?.instance?.state !== 'open') { results[name] = `skip:${st?.instance?.state ?? 'unknown'}`; continue; }

      const wh = await fetch(`${baseUrl}/webhook/set/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
        body: JSON.stringify({
          webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] },
          url: webhookUrl, enabled: true, webhook_by_events: false, webhook_base64: false,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        }),
      });

      const cur = await (await fetch(`${baseUrl}/settings/find/${name}`, { headers: { apikey: EVO_KEY } })).json().catch(() => ({}));
      let settings = 'ok';
      if (cur?.alwaysOnline !== false) {
        const sr = await fetch(`${baseUrl}/settings/set/${name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
          body: JSON.stringify({
            rejectCall: cur?.rejectCall ?? false, msgCall: cur?.msgCall ?? '', groupsIgnore: cur?.groupsIgnore ?? false,
            alwaysOnline: false, readMessages: cur?.readMessages ?? false, readStatus: cur?.readStatus ?? false,
            syncFullHistory: cur?.syncFullHistory ?? false,
          }),
        });
        settings = `set:${sr.status}`;
      }
      results[name] = `webhook:${wh.status} settings:${settings}`;
    } catch (e) {
      results[name] = `error:${String(e).slice(0, 80)}`;
    }
  }
  console.log('[whatsapp-auto-heal]', JSON.stringify(results));
  return json(200, { ok: true, count: Object.keys(results).length, results });
});
