import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Greeting patterns in Portuguese
const GREETING_PATTERNS = [
  /^(oi|olá|ola|oie|oii|oiii|hey|eae|eai|e ai|fala|salve|bom dia|boa tarde|boa noite|hello|hi|opa|ou|ow|ei|hei|alô|alo|tudo bem|td bem|blz|beleza|como vai|boa|bão|buenas)/i,
  /^(quero|queria|gostaria).*(pedir|cardapio|cardápio|menu)/i,
  /^(tem|qual).*(cardapio|cardápio|menu)/i,
];

function isGreeting(message: string): boolean {
  const clean = message.trim().toLowerCase();
  return GREETING_PATTERNS.some(pattern => pattern.test(clean));
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

    // Evolution API sends different event types
    const event = body.event;

    // We only care about incoming messages
    if (event !== 'messages.upsert') {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messageData = body.data;
    if (!messageData) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skip messages sent by us (fromMe = true)
    if (messageData.key?.fromMe) {
      return new Response(JSON.stringify({ ok: true, skipped: 'own_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the text message
    const text = messageData.message?.conversation 
      || messageData.message?.extendedTextMessage?.text 
      || '';

    // If not a greeting, just acknowledge but don't reply
    // IMPORTANT: We must return 200 quickly so Evolution API doesn't mark as failed
    // and doesn't interfere with native WhatsApp notifications
    if (!text || !isGreeting(text)) {
      console.log('Non-greeting message received, passing through:', text?.slice(0, 50));
      return new Response(JSON.stringify({ ok: true, skipped: 'not_greeting' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the instance name from the webhook
    const instanceName = body.instance;
    if (!instanceName) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_instance' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find company for this instance
    const { data: instanceData } = await supabase
      .from('whatsapp_instances')
      .select('company_id')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (!instanceData) {
      console.error('No company found for instance:', instanceName);
      return new Response(JSON.stringify({ ok: true, skipped: 'no_company' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get company info (name + slug for menu link)
    const { data: company } = await supabase
      .from('companies')
      .select('name, slug')
      .eq('id', instanceData.company_id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_company_data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if whatsapp module is enabled
    const { data: moduleData } = await supabase
      .from('company_modules')
      .select('enabled')
      .eq('company_id', instanceData.company_id)
      .eq('module_name', 'whatsapp')
      .maybeSingle();

    if (!moduleData?.enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: 'module_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check store_settings for company-specific site_url first
    const { data: siteUrlSetting } = await supabase
      .from('store_settings')
      .select('value')
      .eq('company_id', instanceData.company_id)
      .eq('key', 'site_url')
      .maybeSingle();
    
    // Priority: company site_url > SITE_URL env > production URL
    const baseUrl = siteUrlSetting?.value 
      || Deno.env.get('SITE_URL') 
      || 'https://appcomandatech.agilizeerp.com.br';
    
    const menuUrl = `${baseUrl.replace(/\/$/, '')}/cardapio/${company.slug}`;

    // Build greeting message
    const greetingMessage = `Olá! 👋 Bem-vindo(a) ao *${company.name}*!\n\nAcesse nosso cardápio digital e faça seu pedido:\n${menuUrl}\n\nQualquer dúvida, estamos à disposição!`;

    // Send auto-reply
    const senderPhone = messageData.key?.remoteJid?.replace('@s.whatsapp.net', '') || '';
    if (!senderPhone) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const evolutionBaseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
    const res = await fetch(`${evolutionBaseUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: senderPhone,
        text: greetingMessage,
      }),
    });

    const responseData = await res.json();
    console.log('Auto-reply sent:', res.ok, JSON.stringify(responseData).slice(0, 200));

    // Log the auto-reply message
    await supabase.from('whatsapp_messages').insert({
      company_id: instanceData.company_id,
      phone: senderPhone,
      message: greetingMessage,
      status: res.ok ? 'sent' : 'failed',
    });

    return new Response(JSON.stringify({ ok: true, replied: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
