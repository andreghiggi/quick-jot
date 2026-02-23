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

    // Get the store phone number (the number connected to WhatsApp)
    const { data: company } = await supabase
      .from('companies')
      .select('phone, name')
      .eq('id', companyId)
      .single();

    const storePhone = company?.phone;
    if (!storePhone) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'no_store_phone' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get order details if not provided
    let message = '';
    if (orderSummary) {
      message = `🔔 *NOVO PEDIDO RECEBIDO!*\n\n${orderSummary}`;
    } else {
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

      if (!order) {
        return new Response(
          JSON.stringify({ ok: true, skipped: 'order_not_found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const itemsList = (items || [])
        .map((item: any) => `• ${item.quantity}x ${item.name} - R$ ${(Number(item.price) * item.quantity).toFixed(2)}${item.notes ? ` (${item.notes})` : ''}`)
        .join('\n');

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

    return new Response(
      JSON.stringify({ ok: true, sent: res.ok }),
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
