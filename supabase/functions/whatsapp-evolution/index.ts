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
    const apiHeaders = { 'apikey': EVOLUTION_API_KEY };
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const parseJsonResponse = async (response: Response) => {
      const text = await response.text();
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        return { raw: text };
      }
    };
    const extractQrCode = (data: any): string | null =>
      data?.base64 || data?.qrcode?.base64 || data?.code || data?.pairingCode || null;
    const fetchConnectionState = async (instanceName: string) => {
      const stateRes = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
        method: 'GET',
        headers: apiHeaders,
      });
      return parseJsonResponse(stateRes);
    };
    const createEvolutionInstance = async (instanceName: string) => {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
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
      return { response: createRes, data: await parseJsonResponse(createRes) };
    };

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
        const { instanceName, companyId } = params;

        // If Evolution still has this instance as "open" while the app expects
        // a QR, force a logout first. Otherwise /instance/connect returns only
        // { state: "open" } and the store cannot reconnect a different number.
        try {
          const stateData = await fetchConnectionState(instanceName);
          if (stateData?.instance?.state === 'open') {
            console.log(`[get_qrcode] ${instanceName} is open; logging out before generating a new QR`);
            await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
              method: 'DELETE',
              headers: apiHeaders,
            }).catch((e) => console.warn('[get_qrcode] logout before QR failed:', e));
            await delay(1800);
            if (companyId) {
              await supabase.from('whatsapp_instances')
                .update({ status: 'disconnected', phone_number: null })
                .eq('company_id', companyId);
            }
          }
        } catch (e) {
          console.warn('[get_qrcode] could not pre-check state:', e);
        }

        let res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
          method: 'GET',
          headers: apiHeaders,
        });
        let data = await parseJsonResponse(res);

        // Some Evolution states need one restart before a fresh QR is emitted.
        // Keep this scoped to the requested instance only.
        if (!extractQrCode(data) && data?.instance?.state === 'open') {
          console.log(`[get_qrcode] ${instanceName} still open after connect; restarting and retrying QR`);
          await fetch(`${baseUrl}/instance/restart/${instanceName}`, {
            method: 'POST',
            headers: apiHeaders,
          }).catch((e) => console.warn('[get_qrcode] restart before QR failed:', e));
          await delay(1800);
          await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
            method: 'DELETE',
            headers: apiHeaders,
          }).catch((e) => console.warn('[get_qrcode] second logout before QR failed:', e));
          await delay(1200);
          res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
            method: 'GET',
            headers: apiHeaders,
          });
          data = await parseJsonResponse(res);
        }

        // Final fallback for corrupted/open sessions that refuse logout/delete:
        // create a fresh instance name for the same store and bind the DB to it.
        // This releases the store immediately without touching other companies.
        if (!extractQrCode(data) && companyId && data?.instance?.state === 'open') {
          const baseInstanceName = instanceName.replace(/-[a-f0-9]{4,8}$/i, '');
          const rolloverName = `${baseInstanceName}-${crypto.randomUUID().slice(0, 4)}`;
          console.warn(`[get_qrcode] ${instanceName} stayed open; rolling over to ${rolloverName}`);

          const created = await createEvolutionInstance(rolloverName);
          if (!created.response.ok) {
            console.error('[get_qrcode] rollover create failed:', JSON.stringify(created.data).slice(0, 300));
          } else {
            await delay(800);
            const qrRes = await fetch(`${baseUrl}/instance/connect/${rolloverName}`, {
              method: 'GET',
              headers: apiHeaders,
            });
            const qrData = await parseJsonResponse(qrRes);
            const rolloverQr = extractQrCode(qrData);
            if (rolloverQr) {
              await supabase.from('whatsapp_instances').upsert({
                company_id: companyId,
                instance_name: rolloverName,
                instance_id: created.data?.instance?.instanceId || created.data?.instanceId || rolloverName,
                status: 'disconnected',
                phone_number: null,
              }, { onConflict: 'company_id' });

              return new Response(JSON.stringify({
                ...qrData,
                success: true,
                instanceName: rolloverName,
                rolledOver: true,
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            data = { ...qrData, instanceName: rolloverName, rolledOver: true };
          }
        }

        if (companyId && extractQrCode(data)) {
          await supabase.from('whatsapp_instances')
            .update({ status: 'disconnected', phone_number: null })
            .eq('company_id', companyId);
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_status': {
        const { instanceName, companyId } = params;
        const res = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
          method: 'GET',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });
        const data = await res.json();

        // Update status + phone_number in DB
        if (data.instance?.state === 'open' && companyId) {
          // Try to fetch the connected phone number from Evolution
          let connectedPhone: string | null = null;
          try {
            const fetchRes = await fetch(`${baseUrl}/instance/fetchInstances`, {
              method: 'GET',
              headers: { 'apikey': EVOLUTION_API_KEY },
            });
            if (fetchRes.ok) {
              const list = await fetchRes.json();
              const arr = Array.isArray(list) ? list : [list];
              const found = arr.find((i: any) =>
                (i?.name || i?.instance?.instanceName || i?.instanceName) === instanceName
              );
              const owner = found?.ownerJid || found?.owner || found?.instance?.owner || found?.number;
              if (owner) {
                // ownerJid format: "5554996771740@s.whatsapp.net"
                connectedPhone = String(owner).split('@')[0].replace(/\D/g, '') || null;
              }
            }
          } catch (e) {
            console.warn('[get_status] Could not fetch instance phone:', e);
          }

          const updatePayload: Record<string, unknown> = { status: 'connected' };
          if (connectedPhone) updatePayload.phone_number = connectedPhone;
          await supabase.from('whatsapp_instances')
            .update(updatePayload)
            .eq('company_id', companyId);
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send_message': {
        const { instanceName, phone, message, companyId, orderId } = params;
        const cleanPhone = phone.replace(/\D/g, '');
        // BR phone normalization based on LENGTH (not prefix), to avoid the DDD-55 ambiguity:
        // 10/11 digits = DDD+number without country → prefix 55
        // 12/13 digits = already has country code 55
        const fullPhone = (cleanPhone.length === 10 || cleanPhone.length === 11)
          ? `55${cleanPhone}`
          : cleanPhone;

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
        const { instanceName, companyId } = params;
        const res = await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: apiHeaders,
        });
        const data = await parseJsonResponse(res);

        if (companyId) {
          await supabase.from('whatsapp_instances')
            .update({ status: 'disconnected', phone_number: null })
            .eq('company_id', companyId);
        }

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'delete_instance': {
        const { instanceName, companyId } = params;
        // Logout first to release the WhatsApp session before deleting the instance.
        try {
          const logoutRes = await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
            method: 'DELETE',
            headers: apiHeaders,
          });
          console.log(`[delete_instance] logout ${instanceName} status=${logoutRes.status}`);
          await logoutRes.text();
          await delay(1000);
        } catch (e) {
          console.warn('[delete_instance] logout before delete failed:', e);
        }

        const res = await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: apiHeaders,
        });
        const data = await parseJsonResponse(res);

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

        // Try Evolution's native "restart" endpoint first — it clears the
        // Baileys pairing state without needing a full delete (which often
        // returns 400 while the instance is stuck in "connecting").
        try {
          const rr = await fetch(`${baseUrl}/instance/restart/${instanceName}`, {
            method: 'POST',
            headers: apiHeaders,
          });
          console.log(`[reset_instance] restart status=${rr.status}`);
        } catch (e) {
          console.warn('[reset_instance] restart error:', e);
        }
        // Give Evolution a moment to reset internal state
        await new Promise((r) => setTimeout(r, 1500));

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
          // Fallback: could not delete on Evolution (often 400 while stuck in
          // "connecting"). Instead of failing, request a fresh QR via /connect
          // on the SAME instance — the restart above already cleared the
          // Baileys session, so this yields a usable pairing code.
          console.warn('[reset_instance] delete blocked; falling back to /instance/connect on existing instance');
          let fallbackQr: string | null = null;
          try {
            const qrRes = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
              method: 'GET',
              headers: apiHeaders,
            });
            const qrData = await qrRes.json();
            fallbackQr = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code || null;
          } catch (e) {
            console.warn('[reset_instance] fallback QR fetch failed:', e);
          }
          if (companyId) {
            await supabase.from('whatsapp_instances').upsert({
              company_id: companyId,
              instance_name: instanceName,
              instance_id: instanceName,
              status: 'disconnected',
            }, { onConflict: 'company_id' });
          }
          if (fallbackQr) {
            return new Response(JSON.stringify({ success: true, reused: true, qrCode: fallbackQr }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          const msg = `Não foi possível resetar a instância "${instanceName}" na Evolution. Tente novamente em alguns segundos.`;
          console.error('[reset_instance] giving up: instance still exists and no QR');
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
          const alreadyInUse =
            (createRes.status === 403 || createRes.status === 409) &&
            /already/i.test(createText);
          if (!alreadyInUse) {
            console.error('[reset_instance] recreate failed:', createRes.status, createText);
            return new Response(JSON.stringify({
              success: false,
              error: `Falha ao recriar instância (HTTP ${createRes.status}): ${createData?.response?.message?.[0] || createData?.message || createText.slice(0, 200)}`,
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          console.log('[reset_instance] recreate said "already in use" — reusing existing instance');
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
