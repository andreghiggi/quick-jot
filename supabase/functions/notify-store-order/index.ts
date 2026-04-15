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
    const { companyId, orderId, orderSummary } = await req.json();

    if (!companyId || !orderId) {
      return new Response(
        JSON.stringify({ error: 'companyId and orderId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if whatsapp module is enabled
    const { data: moduleData } = await supabase
      .from('company_modules')
      .select('enabled')
      .eq('company_id', companyId)
      .eq('module_name', 'whatsapp')
      .maybeSingle();

    if (!moduleData?.enabled) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'module_disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if instance is connected
    const { data: instanceData } = await supabase
      .from('whatsapp_instances')
      .select('instance_name, status, phone_number')
      .eq('company_id', companyId)
      .maybeSingle();

    if (!instanceData || instanceData.status !== 'connected') {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'not_connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get company info (needed for customer messages too)
    const { data: company } = await supabase
      .from('companies')
      .select('phone, name')
      .eq('id', companyId)
      .single();

    // ─── STORE NOTIFICATION: only send if explicitly enabled via store_settings ───
    const { data: notifySetting } = await supabase
      .from('store_settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'notify_store_whatsapp')
      .maybeSingle();

    const storeNotifyEnabled = notifySetting?.value === 'true';
    let storeNotifySent = false;

    if (storeNotifyEnabled && company?.phone) {
      const storePhone = company.phone;

      // Fetch order from DB
      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      if (order) {
        // Build store notification message
        let message = '';
        if (orderSummary) {
          message = `🔔 *NOVO PEDIDO RECEBIDO!*\n\n${orderSummary}`;
        } else {
          const itemsList = (items || [])
            .map((item: any) => {
              let displayName = item.name;
              const lines: string[] = [];
              if (item.name.includes('(') && item.name.endsWith(')')) {
                const idx = item.name.indexOf('(');
                displayName = item.name.substring(0, idx).trim();
                const content = item.name.substring(idx + 1, item.name.length - 1).trim();
                if (content.includes(':')) {
                  const groups = content.split('|').map((g: string) => g.trim()).filter(Boolean);
                  for (const groupStr of groups) {
                    const colonIdx = groupStr.indexOf(':');
                    if (colonIdx > -1) {
                      const groupName = groupStr.substring(0, colonIdx).trim();
                      const itemsStr = groupStr.substring(colonIdx + 1).trim();
                      lines.push(`  - _${groupName}:_ ${itemsStr.replace(/R\$(\d+)\.(\d{2})/g, 'R$$1,$2')}`);
                    } else {
                      lines.push(`  - ${groupStr.replace(/R\$(\d+)\.(\d{2})/g, 'R$$1,$2')}`);
                    }
                  }
                } else {
                  lines.push(`  - _Adicionais:_ ${content.replace(/R\$(\d+)\.(\d{2})/g, 'R$$1,$2')}`);
                }
              }
              const totalPrice = (Number(item.price) * item.quantity).toFixed(2).replace('.', ',');
              let result = `*${item.quantity}x ${displayName}* - R$ ${totalPrice}`;
              if (lines.length > 0) result += '\n' + lines.join('\n');
              if (item.notes) result += `\n  - _Observação:_ ${item.notes}`;
              return result;
            })
            .join('\n\n');

          message = `🔔 *NOVO PEDIDO RECEBIDO!*\n`;
          message += `📋 Pedido #${order.order_code}\n\n`;
          message += `*Cliente:* ${order.customer_name}\n`;
          if (order.customer_phone) message += `*Telefone:* ${order.customer_phone}\n`;
          if (order.delivery_address) message += `*Endereço:* ${order.delivery_address}\n`;
          if (order.notes) message += `*Obs:* ${order.notes}\n`;
          message += `\n*Itens:*\n${itemsList}\n`;
          message += `\n💰 *Total: R$ ${Number(order.total).toFixed(2)}*`;
        }

        // Send message to the store's own number
        const cleanPhone = storePhone.replace(/\D/g, '');
        const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');

        const res = await fetch(`${baseUrl}/message/sendText/${instanceData.instance_name}`, {
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

        const responseData = await res.json();
        console.log('Store notification sent:', res.ok, JSON.stringify(responseData).slice(0, 200));

        // Log the message
        await supabase.from('whatsapp_messages').insert({
          company_id: companyId,
          order_id: orderId,
          phone: fullPhone,
          message,
          status: res.ok ? 'sent' : 'failed',
        });

        storeNotifySent = res.ok;
      }
    } else {
      console.log('Store notification skipped: notify_store_whatsapp not enabled for company', companyId);
    }

    // ─── CUSTOMER CONFIRMATION: send "aguardando confirmação" to customer ───
    let customerConfirmSent = false;
    if (order.customer_phone) {
      try {
        const firstName = order.customer_name.split(' ')[0];
        const confirmMsg = `${firstName}, seu pedido foi enviado e está aguardando confirmação do estabelecimento.\n\nAssim que seu pedido for confirmado, você será notificado por aqui. 😊`;
        const custPhone = order.customer_phone.replace(/\D/g, '');
        const custFullPhone = custPhone.startsWith('55') ? custPhone : `55${custPhone}`;

        const custRes = await fetch(`${baseUrl}/message/sendText/${instanceData.instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: custFullPhone,
            text: confirmMsg,
            linkPreview: false,
          }),
        });

        const custData = await custRes.json();
        console.log('Customer confirmation sent:', custRes.ok, JSON.stringify(custData).slice(0, 200));

        await supabase.from('whatsapp_messages').insert({
          company_id: companyId,
          order_id: orderId,
          phone: custFullPhone,
          message: confirmMsg,
          status: custRes.ok ? 'sent' : 'failed',
        });

        customerConfirmSent = custRes.ok;
      } catch (custError) {
        console.error('Customer confirmation error:', custError);
      }
    }

    // ─── SCHEDULED ORDER: send confirmation to customer if outside business hours ───
    let scheduledSent = false;
    if (order.customer_phone) {
      try {
        // Check if scheduling module is enabled
        const { data: schedulingModule } = await supabase
          .from('company_modules')
          .select('enabled')
          .eq('company_id', companyId)
          .eq('module_name', 'agendamento')
          .maybeSingle();

        // Also check store_settings for public flag
        const { data: schedulingSetting } = await supabase
          .from('store_settings')
          .select('value')
          .eq('company_id', companyId)
          .eq('key', 'accept_order_scheduling')
          .maybeSingle();

        const schedulingEnabled = schedulingModule?.enabled || schedulingSetting?.value === 'true';

        if (schedulingEnabled) {
          // Check if currently outside business hours
          const now = new Date();
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            hour: 'numeric',
            minute: 'numeric',
            weekday: 'short',
            hour12: false,
          });
          const parts = formatter.formatToParts(now);
          const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
          const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
          const weekdayStr = parts.find(p => p.type === 'weekday')?.value || '';
          const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const dayOfWeek = dayMap[weekdayStr] ?? now.getDay();
          const currentMinutes = currentHour * 60 + currentMinute;

          const { data: businessHours } = await supabase
            .from('business_hours')
            .select('*')
            .eq('company_id', companyId)
            .eq('day_of_week', dayOfWeek);

          const hours = businessHours || [];
          const alwaysOpen = hours.some((h: any) => h.always_open);
          let isOpen = alwaysOpen || hours.length === 0;

          if (!isOpen) {
            const openHours = hours.filter((h: any) => h.is_open && h.open_time && h.close_time);
            isOpen = openHours.some((h: any) => {
              const [oH, oM] = h.open_time.split(':').map(Number);
              const [cH, cM] = h.close_time.split(':').map(Number);
              return currentMinutes >= (oH * 60 + oM) && currentMinutes <= (cH * 60 + cM);
            });
          }

          if (!isOpen) {
            // Outside business hours → send scheduled confirmation to customer
            const { data: templateData } = await supabase
              .from('store_settings')
              .select('value')
              .eq('company_id', companyId)
              .eq('key', 'whatsapp_msg_scheduled')
              .maybeSingle();

            const orderCode = order.order_code || '';
            const num = orderCode ? `#${orderCode}` : `#${String(order.daily_number || 0).padStart(3, '0')}`;
            const firstName = order.customer_name.split(' ')[0];

            // Format business hours for the message
            const openHours = hours.filter((h: any) => h.is_open && h.open_time && h.close_time);
            const formattedHours = openHours.length > 0
              ? openHours
                  .sort((a: any, b: any) => (a.period_number || 1) - (b.period_number || 1))
                  .map((h: any) => `${h.open_time.slice(0, 5)} às ${h.close_time.slice(0, 5)}`)
                  .join(' e ')
              : '';

            let scheduledMsg: string;
            if (templateData?.value) {
              scheduledMsg = templateData.value
                .split('{{nome}}').join(firstName)
                .split('{{num}}').join(num)
                .split('{{loja}}').join(company?.name || '')
                .split('{{horario}}').join(formattedHours);
            } else {
              scheduledMsg = `Olá, *${firstName}*! Seu pedido ${num} foi agendado com sucesso 😊\n\n⏰ *Nosso horário de atendimento hoje é: ${formattedHours}*\n\nQuando iniciarmos, seu pedido será confirmado.\n\n*Após a confirmação, ele entrará na fila aguardando o início da produção conforme a ordem de agendamento.*\n\nVocê será avisado(a) assim que o preparo começar, e é a partir desse momento que passa a contar o tempo estimado para entrega do pedido.\n\nAté breve! 👋`;
            }

            const customerPhone = order.customer_phone.replace(/\D/g, '');
            const customerFullPhone = customerPhone.startsWith('55') ? customerPhone : `55${customerPhone}`;

            const schedRes = await fetch(`${baseUrl}/message/sendText/${instanceData.instance_name}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY,
              },
              body: JSON.stringify({
                number: customerFullPhone,
                text: scheduledMsg,
                linkPreview: false,
              }),
            });

            const schedData = await schedRes.json();
            console.log('Scheduled order msg sent to customer:', schedRes.ok, JSON.stringify(schedData).slice(0, 200));

            await supabase.from('whatsapp_messages').insert({
              company_id: companyId,
              order_id: orderId,
              phone: customerFullPhone,
              message: scheduledMsg,
              status: schedRes.ok ? 'sent' : 'failed',
            });

            scheduledSent = schedRes.ok;
          }
        }
      } catch (schedError) {
        console.error('Scheduled order notification error:', schedError);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: res.ok, customerConfirmSent, scheduledSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Notify store error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
