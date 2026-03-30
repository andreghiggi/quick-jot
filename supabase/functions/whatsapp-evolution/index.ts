import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
  const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Evolution API not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { action, ...params } = await req.json();
    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');

    switch (action) {
      case 'create_instance': {
        const { instanceName, companyId } = params;
        
        // Build webhook URL for auto-reply
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

        const res = await fetch(`${baseUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            instanceName,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true,
            rejectCall: false,
            alwaysOnline: false,
            readMessages: false, // Don't mark as read - preserves native notifications
            readStatus: false,
            webhook: {
              url: webhookUrl,
              byEvents: false,
              base64: false,
              events: ['MESSAGES_UPSERT'],
            },
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || JSON.stringify(data));
        }

        // Save instance to DB
        await supabase.from('whatsapp_instances').upsert({
          company_id: companyId,
          instance_name: instanceName,
          instance_id: data.instance?.instanceId || data.instanceId || instanceName,
          status: 'disconnected',
        }, { onConflict: 'company_id' });

        // Also set webhook via separate endpoint (some Evolution API versions need this)
        try {
          await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
              url: webhookUrl,
              webhook_by_events: false,
              webhook_base64: false,
              events: ['MESSAGES_UPSERT'],
              enabled: true,
            }),
          });
          console.log('Webhook configured for instance:', instanceName);
        } catch (webhookErr) {
          console.warn('Could not set webhook separately:', webhookErr);
        }

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_qrcode': {
        const { instanceName } = params;
        const res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
          method: 'GET',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });
        const data = await res.json();

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_status': {
        const { instanceName } = params;
        const res = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
          method: 'GET',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });
        const data = await res.json();

        // Update status in DB
        if (data.instance?.state === 'open') {
          const { companyId } = params;
          if (companyId) {
            await supabase.from('whatsapp_instances')
              .update({ status: 'connected' })
              .eq('company_id', companyId);
          }
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send_message': {
        const { instanceName, phone, message, companyId, orderId } = params;
        const cleanPhone = phone.replace(/\D/g, '');
        const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

        const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: fullPhone,
            text: message,
            linkPreview: false,
          }),
        });
        const data = await res.json();

        // Log message
        if (companyId) {
          await supabase.from('whatsapp_messages').insert({
            company_id: companyId,
            order_id: orderId || null,
            phone: fullPhone,
            message,
            status: res.ok ? 'sent' : 'failed',
          });
        }

        return new Response(JSON.stringify({ success: res.ok, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'disconnect': {
        const { instanceName } = params;
        const res = await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });
        const data = await res.json();

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'delete_instance': {
        const { instanceName, companyId } = params;
        const res = await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });
        const data = await res.json();

        if (companyId) {
          await supabase.from('whatsapp_instances')
            .delete()
            .eq('company_id', companyId);
        }

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Evolution API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
