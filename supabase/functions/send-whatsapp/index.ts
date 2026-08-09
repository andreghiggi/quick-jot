import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface WhatsAppRequest {
  phone: string;
  customerName: string;
  orderId: string;
}

function isValidPhone(phone: unknown): phone is string {
  return typeof phone === 'string' && /^[\d\s()+-]{10,20}$/.test(phone);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated user — this endpoint is for store staff only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;

    const { phone, customerName, orderId }: WhatsAppRequest = await req.json();

    if (
      !isValidPhone(phone) ||
      typeof customerName !== 'string' || customerName.trim().length < 1 || customerName.length > 100 ||
      typeof orderId !== 'string' || orderId.length < 1 || orderId.length > 64
    ) {
      return new Response(JSON.stringify({ error: 'Dados inválidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`WhatsApp notification request for order ${orderId} by user ${userId}`);

    // Clean phone number (remove non-digits)
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Add Brazil country code if not present
    // BR phone normalization based on LENGTH to avoid DDD-55 ambiguity
    const fullPhone = (cleanPhone.length === 10 || cleanPhone.length === 11)
      ? `55${cleanPhone}`
      : cleanPhone;

    // Create WhatsApp message
    const message = encodeURIComponent(
      `Olá ${customerName.trim()}! 🎉\n\nSeu pedido #${orderId.slice(-4)} está *PRONTO*! 🍔\n\nPode retirar ou aguarde a entrega.\n\nObrigado pela preferência! 😊`
    );

    // Generate WhatsApp click-to-chat URL
    const whatsappUrl = `https://wa.me/${fullPhone}?text=${message}`;

    // In a production environment, you would integrate with:
    // - Twilio WhatsApp API
    // - WhatsApp Business API
    // - Evolution API
    // - Or any other WhatsApp integration service

    return new Response(
      JSON.stringify({
        success: true,
        message: 'WhatsApp notification prepared',
        whatsappUrl,
        phone: fullPhone,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-whatsapp function:', error);
    return new Response(
      JSON.stringify({ error: 'Erro ao processar solicitação' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
