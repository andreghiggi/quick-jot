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
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
            },
          }),
        });
        let data = await res.json();

        // Detect "already in use" → recover gracefully by reusing the existing instance
        const errorText = JSON.stringify(data).toLowerCase();
        const alreadyExists =
          !res.ok &&
          (res.status === 403 || res.status === 409) &&
          (errorText.includes('already in use') || errorText.includes('already exists'));

        if (!res.ok && !alreadyExists) {
          throw new Error(data.message || JSON.stringify(data));
        }

        if (alreadyExists) {
          console.log(`[create_instance] Instance ${instanceName} already exists on Evolution. Reusing it.`);
          // Try to fetch its current state so the client can move on to QR code step
          try {
            const stateRes = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
              method: 'GET',
              headers: { 'apikey': EVOLUTION_API_KEY },
            });
            const stateData = await stateRes.json();
            data = { reused: true, state: stateData.instance?.state, instance: { instanceName } };
          } catch (e) {
            console.warn('[create_instance] Could not fetch state of existing instance:', e);
            data = { reused: true, instance: { instanceName } };
          }
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
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
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

        // Normalize line breaks: convert literal \n text to real newlines, normalize \r\n and \r
        const normalizedMessage = message
          .replace(/\\n/g, '\n')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');

        // ─── PRE-FLIGHT: validate real instance status before sending ───
        try {
          const stateRes = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
            method: 'GET',
            headers: { 'apikey': EVOLUTION_API_KEY },
          });
          const stateData = await stateRes.json();
          const realState = stateData.instance?.state;

          if (realState !== 'open') {
            console.warn(`[send_message] Instance ${instanceName} not open (state=${realState}). Aborting send.`);

            // Auto-correct DB status
            if (companyId) {
              await supabase.from('whatsapp_instances')
                .update({ status: 'disconnected' })
                .eq('company_id', companyId);

              // Log failed attempt for visibility
              await supabase.from('whatsapp_messages').insert({
                company_id: companyId,
                order_id: orderId || null,
                phone: fullPhone,
                message,
                status: 'failed',
              });
            }

            return new Response(JSON.stringify({
              success: false,
              error: 'instance_disconnected',
              state: realState,
              message: 'Instância WhatsApp desconectada. Reconecte na tela de Configurações.',
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Instance is open - ensure DB reflects that
          if (companyId) {
            await supabase.from('whatsapp_instances')
              .update({ status: 'connected' })
              .eq('company_id', companyId);
          }
        } catch (preflightErr) {
          console.warn('[send_message] Pre-flight check failed, proceeding anyway:', preflightErr);
        }

        const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: fullPhone,
            text: normalizedMessage,
            linkPreview: false,
          }),
        });
        const data = await res.json();

        // If send failed, mark instance as potentially disconnected
        if (!res.ok && companyId) {
          console.warn(`[send_message] Send failed for ${instanceName}:`, JSON.stringify(data).slice(0, 200));
          // Re-check status to confirm
          try {
            const recheckRes = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
              method: 'GET',
              headers: { 'apikey': EVOLUTION_API_KEY },
            });
            const recheckData = await recheckRes.json();
            if (recheckData.instance?.state !== 'open') {
              await supabase.from('whatsapp_instances')
                .update({ status: 'disconnected' })
                .eq('company_id', companyId);
            }
          } catch (e) {
            console.warn('[send_message] Recheck failed:', e);
          }
        }

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

      // ─── whatsapp-reset-v1 ───────────────────────────────────────────
      // Hard-reset: deletes the instance on Evolution (clearing the corrupted
      // Baileys session that causes "Não foi possível associar o dispositivo"
      // on the phone), waits a moment, then recreates it from scratch and
      // returns a fresh QR code. Use when QR pairing fails on the user's phone.
      // ─────────────────────────────────────────────────────────────────
      case 'reset_instance': {
        const { instanceName, companyId } = params;
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

        console.log(`[reset_instance] Starting hard-reset for ${instanceName}`);

        const apiHeaders = { 'apikey': EVOLUTION_API_KEY };

        // Helper: check if instance still exists on Evolution
        const instanceExists = async (): Promise<boolean> => {
          try {
            const r = await fetch(`${baseUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
              method: 'GET',
              headers: apiHeaders,
            });
            if (!r.ok) return false;
            const list = await r.json();
            if (Array.isArray(list)) {
              return list.some((i: any) => (i?.name || i?.instance?.instanceName || i?.instanceName) === instanceName);
            }
            return false;
          } catch {
            return false;
          }
        };

        const tryLogoutAndDelete = async (label: string) => {
          try {
            const lr = await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
              method: 'DELETE',
              headers: apiHeaders,
            });
            console.log(`[reset_instance][${label}] logout status=${lr.status}`);
          } catch (e) {
            console.warn(`[reset_instance][${label}] logout error:`, e);
          }
          await new Promise((r) => setTimeout(r, 800));
          try {
            const dr = await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
              method: 'DELETE',
              headers: apiHeaders,
            });
            const dt = await dr.text();
            console.log(`[reset_instance][${label}] delete status=${dr.status} body=${dt.slice(0, 200)}`);
          } catch (e) {
            console.warn(`[reset_instance][${label}] delete error:`, e);
          }
        };

        // Round 1
        await tryLogoutAndDelete('round1');

        // Poll up to ~6s for the name to be released
        let exists = true;
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          exists = await instanceExists();
          console.log(`[reset_instance] poll #${i + 1} exists=${exists}`);
          if (!exists) break;
        }

        // Round 2 if still there
        if (exists) {
          console.log('[reset_instance] still exists, doing round2');
          await tryLogoutAndDelete('round2');
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            exists = await instanceExists();
            console.log(`[reset_instance] r2 poll #${i + 1} exists=${exists}`);
            if (!exists) break;
          }
        }

        if (exists) {
          const msg = `Não foi possível remover a instância "${instanceName}" na Evolution. Tente novamente em alguns segundos.`;
          console.error('[reset_instance] giving up: instance still exists');
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Recreate from scratch
        const createRes = await fetch(`${baseUrl}/instance/create`, {
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
            readMessages: false,
            readStatus: false,
            webhook: {
              url: webhookUrl,
              byEvents: false,
              base64: false,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
            },
          }),
        });
        const createText = await createRes.text();
        let createData: any = {};
        try { createData = JSON.parse(createText); } catch { createData = { raw: createText }; }

        if (!createRes.ok) {
          console.error('[reset_instance] recreate failed:', createRes.status, createText);
          return new Response(JSON.stringify({
            success: false,
            error: `Falha ao recriar instância (HTTP ${createRes.status}): ${createData?.response?.message?.[0] || createData?.message || createText.slice(0, 200)}`,
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Update DB
        if (companyId) {
          await supabase.from('whatsapp_instances').upsert({
            company_id: companyId,
            instance_name: instanceName,
            instance_id: createData.instance?.instanceId || createData.instanceId || instanceName,
            status: 'disconnected',
          }, { onConflict: 'company_id' });
        }

        // Try to fetch a fresh QR right away
        let qr: string | null = null;
        try {
          await new Promise((r) => setTimeout(r, 800));
          const qrRes = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
            method: 'GET',
            headers: apiHeaders,
          });
          const qrData = await qrRes.json();
          qr = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code || null;
        } catch (e) {
          console.warn('[reset_instance] could not fetch fresh QR:', e);
        }

        console.log(`[reset_instance] Completed for ${instanceName}, qr=${!!qr}`);

        return new Response(JSON.stringify({ success: true, data: createData, qrCode: qr }), {
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
