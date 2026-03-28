import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find orders delivered 30+ minutes ago that haven't had followup sent
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, customer_name, customer_phone, order_code, daily_number, company_id, notes, delivery_address")
      .eq("status", "delivered")
      .eq("followup_sent", false)
      .not("customer_phone", "is", null)
      .lte("updated_at", thirtyMinAgo);

    if (ordersError) {
      throw new Error(`Error fetching orders: ${ordersError.message}`);
    }

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ message: "No followup orders found", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${orders.length} orders for followup`);

    let sentCount = 0;

    // Group orders by company_id to batch lookups
    const companyIds = [...new Set(orders.map((o) => o.company_id).filter(Boolean))];

    for (const companyId of companyIds) {
      // Check if whatsapp module is enabled
      const { data: moduleData } = await supabase
        .from("company_modules")
        .select("enabled")
        .eq("company_id", companyId)
        .eq("module_name", "whatsapp")
        .maybeSingle();

      if (!moduleData?.enabled) continue;

      // Check if instance is connected
      const { data: instanceData } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("company_id", companyId)
        .maybeSingle();

      if (instanceData?.status !== "connected") continue;

      // Get company info
      const { data: companyData } = await supabase
        .from("companies")
        .select("name, slug")
        .eq("id", companyId)
        .single();

      if (!companyData) continue;

      // Get custom followup message template
      const { data: settingData } = await supabase
        .from("store_settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", "whatsapp_msg_followup")
        .maybeSingle();

      const menuLink = `https://comandatech.com.br/${companyData.slug}`;
      const defaultMessage = `{{nome}}, que bom ter você como cliente do {{loja}}! 😊\n\nEsperamos que tenha gostado do seu pedido. Quando quiser pedir novamente, é só acessar nosso cardápio:\n\n🛒 {{link_cardapio}}\n\nTe esperamos! 💛`;

      const template = settingData?.value || defaultMessage;

      const companyOrders = orders.filter((o) => o.company_id === companyId);

      for (const order of companyOrders) {
        if (!order.customer_phone) continue;

        const firstName = order.customer_name.split(" ")[0];
        const message = template
          .split("{{nome}}").join(firstName)
          .split("{{loja}}").join(companyData.name)
          .split("{{link_cardapio}}").join(menuLink);

        try {
          const { error: sendError } = await supabase.functions.invoke("whatsapp-evolution", {
            body: {
              action: "send_message",
              instanceName: instanceData.instance_name,
              phone: order.customer_phone,
              message,
              companyId,
              orderId: order.id,
            },
          });

          if (sendError) {
            console.error(`Failed to send followup for order ${order.id}:`, sendError);
            continue;
          }

          // Mark as sent
          await supabase
            .from("orders")
            .update({ followup_sent: true })
            .eq("id", order.id);

          sentCount++;
          console.log(`Followup sent for order ${order.id}`);
        } catch (err) {
          console.error(`Error sending followup for order ${order.id}:`, err);
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Followup sent for ${sentCount} orders`, count: sentCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Followup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
