import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

/**
 * Reseller Billing Edge Function — Per-store invoices
 *
 * Actions:
 * - generate_invoices: Generate monthly invoices for each active store of every reseller (cron, 1st of month)
 * - send_notifications: Send due-date reminders + suspend stores 3+ days overdue (cron, daily)
 * - create_prorated_item: Create an individual invoice for a store when it's linked to a reseller
 * - process_overdue: Mark overdue, suspend & reactivate companies (callable on demand)
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, reseller_id, company_id, company_name, activation_fee } = await req.json();

    switch (action) {
      case "generate_invoices":
        return await generateInvoices(supabase);

      case "send_notifications":
        return await sendNotificationsAndProcess(supabase);

      case "create_prorated_item":
        return await createProratedInvoice(supabase, {
          reseller_id,
          company_id,
          company_name,
          activation_fee,
        });

      case "process_overdue":
        return await processOverdue(supabase);

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error("Billing error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[month - 1]} ${year}`;
}

async function generateInvoices(supabase: any) {
  const now = new Date();
  const monthKey = formatMonthKey(now);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const totalDays = daysInMonth(year, month);

  const { data: resellers } = await supabase
    .from("resellers")
    .select("id, name")
    .eq("status", "active");

  if (!resellers?.length) {
    return jsonResponse({ message: "No active resellers", invoices_created: 0 });
  }

  let invoicesCreated = 0;

  for (const reseller of resellers) {
    const { data: settings } = await supabase
      .from("reseller_settings")
      .select("*")
      .eq("reseller_id", reseller.id)
      .maybeSingle();

    const monthlyFee = Number(settings?.monthly_fee ?? 29.90);
    const dueDay = settings?.invoice_due_day ?? 10;

    const { data: companies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("reseller_id", reseller.id);

    if (!companies?.length) continue;

    // Filter to companies with active plans
    const companyIds = companies.map((c: any) => c.id);
    const { data: activePlans } = await supabase
      .from("company_plans")
      .select("company_id")
      .in("company_id", companyIds)
      .eq("active", true);

    const activeIds = new Set((activePlans || []).map((p: any) => p.company_id));
    const activeCompanies = companies.filter((c: any) => activeIds.has(c.id));

    for (const company of activeCompanies) {
      // Skip if invoice already exists for this store/month
      const { data: existing } = await supabase
        .from("reseller_invoices")
        .select("id")
        .eq("company_id", company.id)
        .eq("month", monthKey)
        .maybeSingle();
      if (existing) continue;

      const day = Math.min(dueDay, totalDays);
      const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const { data: invoice, error: invErr } = await supabase
        .from("reseller_invoices")
        .insert({
          reseller_id: reseller.id,
          company_id: company.id,
          month: monthKey,
          due_date: dueDate,
          total_value: monthlyFee,
          status: "pending",
        })
        .select()
        .single();

      if (invErr) {
        console.error(`Error creating invoice ${reseller.id}/${company.id}:`, invErr);
        continue;
      }

      await supabase.from("reseller_invoice_items").insert({
        invoice_id: invoice.id,
        company_id: company.id,
        company_name: company.name,
        type: "monthly",
        value: monthlyFee,
        days_counted: totalDays,
      });

      invoicesCreated++;
    }
  }

  return jsonResponse({ message: "Invoices generated", invoices_created: invoicesCreated });
}

async function sendNotificationsAndProcess(supabase: any) {
  // Step 1: process overdue and suspensions
  const { data: processed } = await supabase.rpc("process_overdue_invoices");

  // Step 2: send due-date reminders for pending invoices
  const today = new Date().toISOString().slice(0, 10);

  const { data: invoices } = await supabase
    .from("reseller_invoices")
    .select("*, resellers!inner(id, name, email, phone), companies!inner(id, name)")
    .in("status", ["pending", "overdue"]);

  let notificationsSent = 0;

  for (const invoice of invoices ?? []) {
    const dueDate = new Date(invoice.due_date + "T12:00:00");
    const todayDate = new Date(today + "T12:00:00");
    const diffDays = Math.round((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

    // Notify at 5/1/0 days before due, and at -3 (suspension day)
    if (![5, 1, 0, -3].includes(diffDays)) continue;

    const reseller = invoice.resellers;
    const company = invoice.companies;
    if (!reseller?.phone) continue;

    const name = reseller.name.split(" ")[0];
    const formattedValue = Number(invoice.total_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const monthLabel = getMonthLabel(invoice.month);
    const portalLink = `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app")}/revendedor/financeiro`;

    let message: string;
    if (diffDays === -3) {
      message = `⚠️ ${name}, a fatura de *${company.name}* (${monthLabel}, R$${formattedValue}) está vencida há 3 dias. A loja foi *bloqueada* automaticamente. Pague para reativar: ${portalLink}`;
    } else if (diffDays === 0) {
      message = `Olá ${name}, a fatura de *${company.name}* (${monthLabel}, R$${formattedValue}) vence *hoje*. ${portalLink}`;
    } else {
      const dia = diffDays === 1 ? "em 1 dia" : `em ${diffDays} dias`;
      message = `Olá ${name}, a fatura de *${company.name}* (${monthLabel}, R$${formattedValue}) vence ${dia}. ${portalLink}`;
    }

    try {
      const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
      const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");
      if (evolutionApiUrl && evolutionApiKey) {
        const phone = reseller.phone.replace(/\D/g, "");
        await fetch(`${evolutionApiUrl}/message/sendText/billing-notifications`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
          body: JSON.stringify({ number: `55${phone}@s.whatsapp.net`, text: message }),
        });
        notificationsSent++;
      }
    } catch (err) {
      console.error(`WhatsApp failed for ${reseller.name}:`, err);
    }
  }

  return jsonResponse({ message: "Done", notifications_sent: notificationsSent, processed });
}

async function processOverdue(supabase: any) {
  const { data, error } = await supabase.rpc("process_overdue_invoices");
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ message: "Processed", result: data });
}

async function createProratedInvoice(
  supabase: any,
  params: { reseller_id: string; company_id: string; company_name?: string; activation_fee?: number }
) {
  const now = new Date();
  const monthKey = formatMonthKey(now);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const totalDays = daysInMonth(year, month);
  const monthStart = new Date(year, month - 1, 1);

  const { data: settings } = await supabase
    .from("reseller_settings")
    .select("*")
    .eq("reseller_id", params.reseller_id)
    .maybeSingle();

  const monthlyFee = Number(settings?.monthly_fee ?? 29.90);
  const dueDay = settings?.invoice_due_day ?? 10;
  const activationFee = params.activation_fee ?? Number(settings?.activation_fee ?? 0);

  let companyName = params.company_name;
  if (!companyName) {
    const { data: c } = await supabase
      .from("companies")
      .select("name")
      .eq("id", params.company_id)
      .maybeSingle();
    companyName = c?.name || "Loja";
  }

  // Determine effective billing start date
  const { data: plan } = await supabase
    .from("company_plans")
    .select("activated_at, starts_at")
    .eq("company_id", params.company_id)
    .maybeSingle();

  const activationDateStr: string | null = plan?.activated_at || plan?.starts_at || null;

  let effectiveStart: Date;
  if (activationDateStr) {
    const activationDate = new Date(activationDateStr);
    effectiveStart = activationDate < monthStart ? monthStart : activationDate;
  } else {
    effectiveStart = now;
  }

  const startDay = effectiveStart.getMonth() + 1 === month && effectiveStart.getFullYear() === year
    ? effectiveStart.getDate()
    : 1;

  const remainingDays = totalDays - startDay + 1;
  const isFullMonth = remainingDays >= totalDays;

  const chargedValue = isFullMonth
    ? monthlyFee
    : Math.round(((monthlyFee / totalDays) * remainingDays) * 100) / 100;
  const itemType: "monthly" | "prorated" = isFullMonth ? "monthly" : "prorated";

  // Find or create invoice for this store/month (unique per company+month)
  let { data: invoice } = await supabase
    .from("reseller_invoices")
    .select("*")
    .eq("company_id", params.company_id)
    .eq("month", monthKey)
    .maybeSingle();

  if (!invoice) {
    const day = Math.min(dueDay, totalDays);
    const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const { data: newInvoice, error } = await supabase
      .from("reseller_invoices")
      .insert({
        reseller_id: params.reseller_id,
        company_id: params.company_id,
        month: monthKey,
        due_date: dueDate,
        total_value: 0,
        status: "pending",
      })
      .select()
      .single();
    if (error) return jsonResponse({ error: error.message }, 500);
    invoice = newInvoice;
  }

  if (!invoice) return jsonResponse({ error: "Failed to create invoice" }, 500);

  const items: any[] = [];
  if (activationFee > 0) {
    items.push({
      invoice_id: invoice.id,
      company_id: params.company_id,
      company_name: companyName,
      type: "activation",
      value: activationFee,
    });
  }
  items.push({
    invoice_id: invoice.id,
    company_id: params.company_id,
    company_name: companyName,
    type: itemType,
    value: chargedValue,
    days_counted: remainingDays,
  });

  await supabase.from("reseller_invoice_items").insert(items);

  const newTotal = Number(invoice.total_value) + activationFee + chargedValue;
  await supabase
    .from("reseller_invoices")
    .update({ total_value: newTotal })
    .eq("id", invoice.id);

  return jsonResponse({
    invoice_id: invoice.id,
    company_id: params.company_id,
    item_type: itemType,
    charged_value: chargedValue,
    activation_fee: activationFee,
    remaining_days: remainingDays,
    total_days: totalDays,
  });
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
