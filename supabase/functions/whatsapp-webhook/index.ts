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
  if (url.includes('lovable.app') || url.includes('lovableproject.com') || url.includes('localhost')) {
    return PRODUCTION_URL;
  }
  return url;
}

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatBusinessHours(hours: any[]): string {
  if (!hours || hours.length === 0) return 'não definido';
  
  // Filter only today's hours that are open
  const openHours = hours.filter(h => h.is_open && h.open_time && h.close_time);
  if (openHours.length === 0) return 'fechado hoje';
  
  return openHours
    .sort((a, b) => (a.period_number || 1) - (b.period_number || 1))
    .map(h => `${h.open_time.slice(0, 5)} às ${h.close_time.slice(0, 5)}`)
    .join(' e ');
}

function getSaoPauloTime(): { hours: number; minutes: number; dayOfWeek: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value || '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[weekdayStr] ?? new Date().getDay();
  return { hours, minutes, dayOfWeek };
}

function isWithinBusinessHours(hours: any[]): boolean {
  if (!hours || hours.length === 0) return true; // No hours configured = always open
  
  // Check always_open flag
  if (hours.some(h => h.always_open)) return true;
  
  const { hours: h, minutes: m } = getSaoPauloTime();
  const currentMinutes = h * 60 + m;
  
  const openHours = hours.filter(h => h.is_open && h.open_time && h.close_time);
  
  return openHours.some(h => {
    const [openH, openM] = h.open_time.split(':').map(Number);
    const [closeH, closeM] = h.close_time.split(':').map(Number);
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;
    return currentMinutes >= openMin && currentMinutes <= closeMin;
  });
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
      console.log('Lock conflict for', senderPhone, '- another execution handling');
      return new Response(JSON.stringify({ ok: true, skipped: 'lock_conflict' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

      // Get company + module check + business hours + settings in parallel
      const now = new Date();
      const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const dayOfWeek = brTime.getDay();

      const [companyRes, moduleRes, hoursRes, settingsRes, schedulingModuleRes] = await Promise.all([
        supabase.from('companies').select('name, slug').eq('id', companyId).single(),
        supabase.from('company_modules').select('enabled').eq('company_id', companyId).eq('module_name', 'whatsapp').maybeSingle(),
        supabase.from('business_hours').select('*').eq('company_id', companyId).eq('day_of_week', dayOfWeek),
        supabase.from('store_settings').select('key, value').eq('company_id', companyId).in('key', ['site_url', 'whatsapp_msg_autoreply_closed', 'whatsapp_msg_autoreply_closed_scheduling']),
        supabase.from('company_modules').select('enabled').eq('company_id', companyId).eq('module_name', 'agendamento').maybeSingle(),
      ]);

      if (!companyRes.data || !moduleRes.data?.enabled) {
        await releaseLock();
        return new Response(JSON.stringify({ ok: true, skipped: 'no_company_or_disabled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const company = companyRes.data;
      const businessHours = hoursRes.data || [];
      const hasScheduling = schedulingModuleRes.data?.enabled || false;

      // Get settings map
      const settingsMap: Record<string, string> = {};
      settingsRes.data?.forEach((s: any) => {
        if (s.value) settingsMap[s.key] = s.value;
      });

      const baseUrl = sanitizeBaseUrl(settingsMap['site_url'] || Deno.env.get('SITE_URL') || null);
      const menuUrl = `${baseUrl.replace(/\/$/, '')}/cardapio/${company.slug}`;

      // Try to get sender name from contacts
      const senderName = messageData.pushName || 'cliente';
      const firstName = senderName.split(' ')[0];

      // Check if within business hours
      const withinHours = isWithinBusinessHours(businessHours);
      const hoursText = formatBusinessHours(businessHours);

      let greetingMessage: string;

      if (!withinHours && businessHours.length > 0) {
        // Outside business hours - use custom template
        const templateKey = hasScheduling ? 'whatsapp_msg_autoreply_closed_scheduling' : 'whatsapp_msg_autoreply_closed';
        const customTemplate = settingsMap[templateKey];

        if (customTemplate) {
          greetingMessage = customTemplate
            .split('{{nome}}').join(firstName)
            .split('{{loja}}').join(company.name)
            .split('{{horario}}').join(hoursText)
            .split('{{link_cardapio}}').join(menuUrl);
        } else if (hasScheduling) {
          greetingMessage = `Olá, ${firstName}! Que bom te ver por aqui 😊\n\nNo momento estamos fora do horário de atendimento, mas você já pode deixar seu pedido agendado!\n\n⏰ Nosso horário de atendimento hoje é ${hoursText}.\n\nQuando iniciarmos, seu pedido entrará na fila de produção e você será avisado assim que começar o preparo.\n\n👉 Faça seu pedido aqui:\n${menuUrl}`;
        } else {
          greetingMessage = `Olá, ${firstName}! Que bom te ver por aqui 😊\n\nNo momento estamos fora do horário de atendimento, mas já já voltamos!\n\n⏰ Nosso horário de atendimento hoje é ${hoursText}.\n\nAssim que abrirmos, você pode fazer seu pedido direto por aqui:\n${menuUrl}\n\nSe quiser, já dá uma olhadinha no cardápio e escolhe o que vai pedir 😏\n\nTe esperamos!`;
        }
      } else {
        // Within business hours or no hours configured - default greeting
        greetingMessage = `Olá! 👋 Bem-vindo(a) ao *${company.name}*!\n\nAcesse nosso cardápio digital e faça seu pedido:\n${menuUrl}\n\nQualquer dúvida, estamos à disposição!`;
      }

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

      await releaseLock();

      return new Response(JSON.stringify({ ok: true, replied: true, outsideHours: !withinHours }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (innerError) {
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