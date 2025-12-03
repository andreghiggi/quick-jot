import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppRequest {
  phone: string;
  customerName: string;
  orderId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, customerName, orderId }: WhatsAppRequest = await req.json();

    console.log(`WhatsApp notification request for order ${orderId}`);
    console.log(`Customer: ${customerName}, Phone: ${phone}`);

    // Clean phone number (remove non-digits)
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Add Brazil country code if not present
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // Create WhatsApp message
    const message = encodeURIComponent(
      `Olá ${customerName}! 🎉\n\nSeu pedido #${orderId.slice(-4)} está *PRONTO*! 🍔\n\nPode retirar ou aguarde a entrega.\n\nObrigado pela preferência! 😊`
    );

    // Generate WhatsApp click-to-chat URL
    const whatsappUrl = `https://wa.me/${fullPhone}?text=${message}`;

    console.log(`WhatsApp URL generated: ${whatsappUrl}`);

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
