import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Greeting patterns - only clear initial greetings, NOT mid-conversation phrases
const GREETING_PATTERNS = [
  /^(oi+e?|olá|ola|hey|eae|eai|e ai|fala|salve|bom dia|boa tarde|boa noite|hello|hi|opa|ou|ow|ei|hei|alô|alo|boa|bão|buenas)\b/i,
  /^(quero|queria|gostaria).*(pedir|cardapio|cardápio|menu)/i,
  /^(tem|qual).*(cardapio|cardápio|menu)/i,
];

// Production URL - NEVER use Lovable preview URLs
const PRODUCTION_URL = 'https://appcomandatech.agilizeerp.com.br';

function isGreeting(message: string): boolean {
  const clean = message.trim().toLowerCase();
  return GREETING_PATTERNS.some(pattern => pattern.test(clean));
}

function sanitizeBaseUrl(url: string | null): string {
  if (!url) return PRODUCTION_URL;
  // Block any Lovable preview/dev URLs
  if (url.includes('lovable.app') || url.includes('lovableproject.com') || url.includes('localhost')) {
    return PRODUCTION_URL;
  }
  return url;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
  const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !SUPABASE_URL) {
    console.error('Missing required env vars');
    return new Response(JSON.stringify({ error: 'Not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    SUPABASE_URL,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json();
    console.log('Webhook received:', JSON.stringify(body).slice(0, 500));

    if (body.event !== 'messages.upsert') {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messageData = body.data;
    if (!messageData || messageData.key?.fromMe) {
      return new Response(JSON.stringify({ ok: true, skipped: messageData ? 'own_message' : 'no_data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const text = messageData.message?.conversation
      || messageData.message?.extendedTextMessage?.text
      || '';

    if (!text || !isGreeting(text)) {
      console.log('Non-greeting, passing through:', text?.slice(0, 50));
      return new Response(JSON.stringify({ ok: true, skipped: 'not_greeting' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanceName = body.instance;
    const senderPhone = messageData.key?.remoteJid?.replace('@s.whatsapp.net', '') || '';
    if (!instanceName || !senderPhone) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_instance_or_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find company
    const { data: instanceData } = await supabase
      .from('whatsapp_instances')
      .select('company_id')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (!instanceData) {
      console.error('No company for instance:', instanceName);
      return new Response(JSON.stringify({ ok: true, skipped: 'no_company' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const companyId = instanceData.company_id;

    // ─── ATOMIC LOCK: prevent race condition on concurrent messages ───
    const { error: lockError } = await supabase
      .from('whatsapp_auto_reply_locks')
      .insert({ company_id: companyId, phone: senderPhone });

    if (lockError) {
      // Unique constraint violation = another execution is already handling this
      console.log('Lock conflict for', senderPhone, '- another execution handling');
      return new Response(JSON.stringify({ ok: true, skipped: 'lock_conflict' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Helper to release lock before returning
    const releaseLock = () =>
      supabase.from('whatsapp_auto_reply_locks')
        .delete()
        .eq('company_id', companyId)
        .eq('phone', senderPhone);

    try {
      // COOLDOWN: 24h per phone per company
      const cooldownDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentReply } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('company_id', companyId)
        .eq('phone', senderPhone)
        .eq('status', 'sent')
        .gte('created_at', cooldownDate)
        .is('order_id', null)
        .limit(1)
        .maybeSingle();

      if (recentReply) {
        console.log('Cooldown active for:', senderPhone);
        await releaseLock();
        return new Response(JSON.stringify({ ok: true, skipped: 'cooldown_active' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get company + module check in parallel
      const [companyRes, moduleRes] = await Promise.all([
        supabase.from('companies').select('name, slug').eq('id', companyId).single(),
        supabase.from('company_modules').select('enabled').eq('company_id', companyId).eq('module_name', 'whatsapp').maybeSingle(),
      ]);

      if (!companyRes.data || !moduleRes.data?.enabled) {
        await releaseLock();
        return new Response(JSON.stringify({ ok: true, skipped: 'no_company_or_disabled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const company = companyRes.data;

      // Get site URL, sanitize against Lovable preview URLs
      const { data: siteUrlSetting } = await supabase
        .from('store_settings')
        .select('value')
        .eq('company_id', companyId)
        .eq('key', 'site_url')
        .maybeSingle();

      const baseUrl = sanitizeBaseUrl(siteUrlSetting?.value || Deno.env.get('SITE_URL') || null);
      const menuUrl = `${baseUrl.replace(/\/$/, '')}/cardapio/${company.slug}`;

      const greetingMessage = `Olá! 👋 Bem-vindo(a) ao *${company.name}*!\n\nAcesse nosso cardápio digital e faça seu pedido:\n${menuUrl}\n\nQualquer dúvida, estamos à disposição!`;

      // Send message
      const evolutionBaseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
      const res = await fetch(`${evolutionBaseUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number: senderPhone, text: greetingMessage }),
      });

      const responseData = await res.json();
      console.log('Auto-reply sent:', res.ok, JSON.stringify(responseData).slice(0, 200));

      // Log the message
      await supabase.from('whatsapp_messages').insert({
        company_id: companyId,
        phone: senderPhone,
        message: greetingMessage,
        status: res.ok ? 'sent' : 'failed',
      });

      // Release lock
      await releaseLock();

      return new Response(JSON.stringify({ ok: true, replied: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (innerError) {
      // Always release lock on error
      await releaseLock();
      throw innerError;
    }
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
