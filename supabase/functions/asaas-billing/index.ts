import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_SANDBOX_URL = "https://sandbox.asaas.com/api/v3";
const ASAAS_PROD_URL = "https://api.asaas.com/v3";

function getAsaasUrl(env: string) {
  return env === "production" ? ASAAS_PROD_URL : ASAAS_SANDBOX_URL;
}

async function asaasFetch(path: string, opts: RequestInit, apiKey: string, env: string) {
  const url = `${getAsaasUrl(env)}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      "access_token": apiKey,
      "Content-Type": "application/json",
      "User-Agent": "ComandaTech/1.0",
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Asaas ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
    if (!ASAAS_API_KEY) throw new Error("ASAAS_API_KEY não configurada");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const action = body.action;

    // Get env from admin_settings
    const { data: adminSettings } = await supabase
      .from("admin_settings")
      .select("asaas_env")
      .limit(1)
      .single();
    const env = adminSettings?.asaas_env || "sandbox";

    // ===== ENSURE CUSTOMER =====
    async function ensureCustomer(resellerId: string): Promise<string> {
      const { data: reseller, error } = await supabase
        .from("resellers")
        .select("*")
        .eq("id", resellerId)
        .single();
      if (error || !reseller) throw new Error("Revendedor não encontrado");

      if (reseller.asaas_customer_id) return reseller.asaas_customer_id;

      // Create customer in Asaas
      const cpfCnpj = (reseller.cnpj || "").replace(/\D/g, "");
      const customerPayload: any = {
        name: reseller.name,
        email: reseller.email,
        mobilePhone: (reseller.phone || "").replace(/\D/g, "") || undefined,
      };
      if (cpfCnpj) customerPayload.cpfCnpj = cpfCnpj;

      const customer = await asaasFetch("/customers", {
        method: "POST",
        body: JSON.stringify(customerPayload),
      }, ASAAS_API_KEY, env);

      await supabase
        .from("resellers")
        .update({ asaas_customer_id: customer.id })
        .eq("id", resellerId);

      return customer.id;
    }

    if (action === "create_charge") {
      const { invoice_id } = body;
      if (!invoice_id) throw new Error("invoice_id obrigatório");

      const { data: invoice, error: iErr } = await supabase
        .from("reseller_invoices")
        .select("*, companies(name), resellers!reseller_invoices_reseller_id_fkey(*)")
        .eq("id", invoice_id)
        .single();
      if (iErr || !invoice) throw new Error("Fatura não encontrada");

      // If already has charge, return it
      if (invoice.asaas_charge_id) {
        return new Response(JSON.stringify({
          ok: true,
          already_exists: true,
          charge_id: invoice.asaas_charge_id,
          invoice_url: invoice.asaas_invoice_url,
          pix_qrcode: invoice.asaas_pix_qrcode,
          pix_payload: invoice.asaas_pix_payload,
          boleto_url: invoice.asaas_boleto_url,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const customerId = await ensureCustomer(invoice.reseller_id);
      const companyName = (invoice as any).companies?.name || "Loja";

      const chargePayload = {
        customer: customerId,
        billingType: "UNDEFINED", // permite PIX ou Boleto
        value: Number(invoice.total_value),
        dueDate: invoice.due_date,
        description: `Mensalidade ${invoice.month} - ${companyName}`,
        externalReference: invoice.id,
      };

      const charge = await asaasFetch("/payments", {
        method: "POST",
        body: JSON.stringify(chargePayload),
      }, ASAAS_API_KEY, env);

      // Fetch PIX QR code
      let pixQrcode: string | null = null;
      let pixPayload: string | null = null;
      try {
        const pixData = await asaasFetch(`/payments/${charge.id}/pixQrCode`, {
          method: "GET",
        }, ASAAS_API_KEY, env);
        pixQrcode = pixData.encodedImage || null;
        pixPayload = pixData.payload || null;
      } catch (e) {
        console.warn("PIX QR Code fetch failed:", e);
      }

      const updates: any = {
        asaas_charge_id: charge.id,
        asaas_invoice_url: charge.invoiceUrl || null,
        asaas_boleto_url: charge.bankSlipUrl || null,
        asaas_pix_qrcode: pixQrcode,
        asaas_pix_payload: pixPayload,
        asaas_status: charge.status || "PENDING",
        asaas_env: env,
      };

      await supabase.from("reseller_invoices").update(updates).eq("id", invoice_id);

      return new Response(JSON.stringify({
        ok: true,
        charge_id: charge.id,
        invoice_url: charge.invoiceUrl,
        pix_qrcode: pixQrcode,
        pix_payload: pixPayload,
        boleto_url: charge.bankSlipUrl,
        status: charge.status,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "sync_status") {
      const { invoice_id } = body;
      const { data: invoice } = await supabase
        .from("reseller_invoices")
        .select("*")
        .eq("id", invoice_id)
        .single();
      if (!invoice?.asaas_charge_id) throw new Error("Fatura sem cobrança Asaas");

      const charge = await asaasFetch(`/payments/${invoice.asaas_charge_id}`, {
        method: "GET",
      }, ASAAS_API_KEY, env);

      const updates: any = { asaas_status: charge.status };
      if (charge.status === "RECEIVED" || charge.status === "CONFIRMED") {
        updates.status = "paid";
        updates.paid_at = charge.paymentDate ? new Date(charge.paymentDate).toISOString() : new Date().toISOString();
        updates.payment_method = charge.billingType?.toLowerCase() || "asaas";
      }

      await supabase.from("reseller_invoices").update(updates).eq("id", invoice_id);

      return new Response(JSON.stringify({ ok: true, status: charge.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "webhook") {
      const event = body.event;
      const payment = body.payment;
      if (!payment?.id) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const updates: any = { asaas_status: payment.status };
      if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
        updates.status = "paid";
        updates.paid_at = new Date().toISOString();
        updates.payment_method = payment.billingType?.toLowerCase() || "asaas";
      } else if (event === "PAYMENT_OVERDUE") {
        updates.status = "overdue";
      }
      await supabase
        .from("reseller_invoices")
        .update(updates)
        .eq("asaas_charge_id", payment.id);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Ação desconhecida: ${action}`);
  } catch (err: any) {
    console.error("asaas-billing error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
