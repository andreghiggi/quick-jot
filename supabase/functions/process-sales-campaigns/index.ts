// Cron-driven sales campaign processor.
// Called every minute by pg_cron. Sends 1 message per running campaign per tick,
// respecting interval, daily limit and time window.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_MENU_ORIGIN = 'https://app.comandatech.com.br';

function firstName(full: string) {
  return (full || '').trim().split(/\s+/)[0] || 'Cliente';
}

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function nowInSP() {
  // Returns current time in São Paulo as { hour, dateStr (YYYY-MM-DD) }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    hour: parseInt(parts.hour),
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { data: settings } = await supabase
      .from('campaign_settings').select('*').limit(1).maybeSingle();
    const intervalSec = settings?.interval_seconds ?? 60;
    const maxPerDay = settings?.max_per_day ?? 100;
    const startHour = settings?.start_hour ?? 8;
    const endHour = settings?.end_hour ?? 20;

    const { hour, dateStr } = nowInSP();
    if (hour < startHour || hour >= endHour) {
      return new Response(JSON.stringify({ skipped: 'outside_window', hour }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: campaigns } = await supabase
      .from('sales_campaigns').select('*').eq('status', 'running');

    const results: any[] = [];
    for (const c of campaigns || []) {
      // Reset daily counter
      let sentToday = c.sent_today || 0;
      if (c.sent_today_date !== dateStr) sentToday = 0;

      if (sentToday >= maxPerDay) {
        results.push({ campaign: c.id, skipped: 'daily_limit' });
        continue;
      }

      // Respect interval
      if (c.last_sent_at) {
        const elapsed = (Date.now() - new Date(c.last_sent_at).getTime()) / 1000;
        if (elapsed < intervalSec) {
          results.push({ campaign: c.id, skipped: 'interval', elapsed });
          continue;
        }
      }

      // Pick next pending message
      const { data: pending } = await supabase
        .from('sales_campaign_messages')
        .select('*').eq('campaign_id', c.id).eq('status', 'pending')
        .order('created_at', { ascending: true }).limit(1).maybeSingle();

      if (!pending) {
        await supabase.from('sales_campaigns').update({
          status: 'completed', completed_at: new Date().toISOString(),
        }).eq('id', c.id);
        results.push({ campaign: c.id, completed: true });
        continue;
      }

      // Skip no-phone
      const phone = (pending.customer_phone || '').replace(/\D/g, '');
      if (!phone || phone.length < 10) {
        await supabase.from('sales_campaign_messages').update({
          status: 'skipped', error_message: 'sem telefone válido',
        }).eq('id', pending.id);
        await supabase.from('sales_campaigns').update({
          skipped_count: (c.skipped_count || 0) + 1,
        }).eq('id', c.id);
        results.push({ campaign: c.id, message: pending.id, skipped: 'no_phone' });
        continue;
      }

      // Get instance
      const { data: inst } = await supabase
        .from('whatsapp_instances').select('*').eq('company_id', c.company_id).maybeSingle();
      if (!inst || inst.status !== 'connected') {
        results.push({ campaign: c.id, skipped: 'no_instance' });
        continue;
      }

      // Get menu URL
      const { data: company } = await supabase
        .from('companies').select('slug').eq('id', c.company_id).maybeSingle();
      const menuLink = `${PUBLIC_MENU_ORIGIN}/cardapio/${company?.slug || ''}`;

      // Variation: A on even sent_count, B on odd
      const variation = (c.sent_count % 2 === 0) ? 'A' : 'B';
      const tpl = variation === 'A' ? c.message_a : c.message_b;
      const text = renderTemplate(tpl, {
        nome: firstName(pending.customer_name),
        link_cardapio: menuLink,
      });

      // Send via Evolution
      let sendOk = false; let errMsg = '';
      try {
        const { data: sendResp, error: sendErr } = await supabase.functions.invoke('whatsapp-evolution', {
          body: {
            action: 'send_message',
            instanceName: inst.instance_name,
            phone,
            message: text,
            companyId: c.company_id,
          },
        });
        if (sendErr) errMsg = sendErr.message || 'erro';
        else if (sendResp?.success === false) errMsg = sendResp?.error || 'falha no envio';
        else sendOk = true;
      } catch (e: any) {
        errMsg = e.message || 'exception';
      }

      const nowIso = new Date().toISOString();
      await supabase.from('sales_campaign_messages').update({
        status: sendOk ? 'sent' : 'failed',
        variation, message_text: text,
        error_message: sendOk ? null : errMsg,
        sent_at: nowIso,
      }).eq('id', pending.id);

      await supabase.from('sales_campaigns').update({
        sent_count: (c.sent_count || 0) + (sendOk ? 1 : 0),
        failed_count: (c.failed_count || 0) + (sendOk ? 0 : 1),
        sent_today: sentToday + 1,
        sent_today_date: dateStr,
        last_sent_at: nowIso,
      }).eq('id', c.id);

      results.push({ campaign: c.id, message: pending.id, sent: sendOk, error: errMsg || undefined });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('process-sales-campaigns error', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
