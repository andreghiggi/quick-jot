import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

/**
 * Reseller Billing Edge Function
 * 
 * Actions:
 * - generate_invoices: Generate monthly invoices for all resellers (called on 1st of month via cron)
 * - send_notifications: Send due date reminders (called daily via cron)
 * - create_prorated_item: Add a prorated charge when a company is activated mid-month
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
        return await sendNotifications(supabase);

      case "create_prorated_item":
        return await createProratedItem(supabase, {
          reseller_id,
          company_id,
          company_name,
          activation_fee,
        });

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
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

  // Get all active resellers with settings
  const { data: resellers } = await supabase
    .from("resellers")
    .select("id, name, email, phone")
    .eq("status", "active");

  if (!resellers?.length) {
    return jsonResponse({ message: "No active resellers", invoices_created: 0 });
  }

  let invoicesCreated = 0;

  for (const reseller of resellers) {
    // Check if invoice already exists for this month
    const { data: existing } = await supabase
      .from("reseller_invoices")
      .select("id")
      .eq("reseller_id", reseller.id)
      .eq("month", monthKey)
      .maybeSingle();

    if (existing) continue;

    // Get reseller settings
    const { data: settings } = await supabase
      .from("reseller_settings")
      .select("*")
      .eq("reseller_id", reseller.id)
      .maybeSingle();

    const monthlyFee = settings?.monthly_fee || 29.90;
    const dueDay = settings?.invoice_due_day || 10;

    // Get active companies for this reseller
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("reseller_id", reseller.id)
      .eq("active", true);

    if (!companies?.length) continue;

    // Filter to those with active plans
    const companyIds = companies.map((c: any) => c.id);
    const { data: activePlans } = await supabase
      .from("company_plans")
      .select("company_id")
      .in("company_id", companyIds)
      .eq("active", true);

    const activeCompanyIds = new Set((activePlans || []).map((p: any) => p.company_id));
    const activeCompanies = companies.filter((c: any) => activeCompanyIds.has(c.id));

    if (!activeCompanies.length) continue;

    const totalValue = activeCompanies.length * monthlyFee;
    const maxDay = daysInMonth(year, month);
    const day = Math.min(dueDay, maxDay);
    const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // Create invoice
    const { data: invoice, error: invErr } = await supabase
      .from("reseller_invoices")
      .insert({
        reseller_id: reseller.id,
        month: monthKey,
        due_date: dueDate,
        total_value: totalValue,
        status: "pending",
      })
      .select()
      .single();

    if (invErr) {
      console.error(`Error creating invoice for reseller ${reseller.id}:`, invErr);
      continue;
    }

    // Create line items
    const items = activeCompanies.map((c: any) => ({
      invoice_id: invoice.id,
      company_id: c.id,
      company_name: c.name,
      type: "monthly",
      value: monthlyFee,
      days_counted: maxDay,
    }));

    await supabase.from("reseller_invoice_items").insert(items);
    invoicesCreated++;
  }

  return jsonResponse({ message: "Invoices generated", invoices_created: invoicesCreated });
}

async function sendNotifications(supabase: any) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Get pending invoices
  const { data: invoices } = await supabase
    .from("reseller_invoices")
    .select("*, resellers!inner(id, name, email, phone)")
    .eq("status", "pending");

  if (!invoices?.length) {
    return jsonResponse({ message: "No pending invoices", notifications_sent: 0 });
  }

  let notificationsSent = 0;

  for (const invoice of invoices) {
    const dueDate = new Date(invoice.due_date + "T12:00:00");
    const todayDate = new Date(today + "T12:00:00");
    const diffMs = dueDate.getTime() - todayDate.getTime();
    const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // Check if overdue
    if (daysUntilDue < 0) {
      await supabase
        .from("reseller_invoices")
        .update({ status: "overdue" })
        .eq("id", invoice.id);
      continue;
    }

    // Send notifications at 5 days, 1 day, and 0 days before due
    if (![5, 1, 0].includes(daysUntilDue)) continue;

    const reseller = invoice.resellers;
    const name = reseller.name.split(" ")[0];
    const formattedValue = Number(invoice.total_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const monthLabel = getMonthLabel(invoice.month);
    const portalLink = `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app")}/revendedor/financeiro`;

    let diaText: string;
    if (daysUntilDue === 0) {
      diaText = "hoje";
    } else if (daysUntilDue === 1) {
      diaText = "em 1 dia";
    } else {
      diaText = `em ${daysUntilDue} dias`;
    }

    const message = `Olá ${name}, sua fatura de ${monthLabel} no valor de R$${formattedValue} vence ${diaText}. Acesse o painel para realizar o pagamento: ${portalLink}`;

    // Send WhatsApp via Evolution API if phone is available
    if (reseller.phone) {
      try {
        const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
        const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

        if (evolutionApiUrl && evolutionApiKey) {
          // Get whatsapp instance for sending (use first available)
          const phone = reseller.phone.replace(/\D/g, "");

          await fetch(`${evolutionApiUrl}/message/sendText/billing-notifications`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evolutionApiKey,
            },
            body: JSON.stringify({
              number: `55${phone}@s.whatsapp.net`,
              text: message,
            }),
          });

          notificationsSent++;
        }
      } catch (err) {
        console.error(`WhatsApp notification failed for ${reseller.name}:`, err);
      }
    }

    // Log notification (email placeholder — would use Lovable Emails when configured)
    console.log(`Notification for ${reseller.name}: ${message}`);
  }

  return jsonResponse({ message: "Notifications processed", notifications_sent: notificationsSent });
}

async function createProratedItem(
  supabase: any,
  params: { reseller_id: string; company_id: string; company_name: string; activation_fee?: number }
) {
  const now = new Date();
  const monthKey = formatMonthKey(now);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Get reseller settings
  const { data: settings } = await supabase
    .from("reseller_settings")
    .select("*")
    .eq("reseller_id", params.reseller_id)
    .maybeSingle();

  const monthlyFee = settings?.monthly_fee || 29.90;
  const dueDay = settings?.invoice_due_day || 10;
  const activationFee = params.activation_fee ?? settings?.activation_fee ?? 180;

  // Calculate prorated fee
  const totalDays = daysInMonth(year, month);
  const dayOfMonth = now.getDate();
  const remainingDays = totalDays - dayOfMonth + 1;
  const proratedValue = Math.round(((monthlyFee / totalDays) * remainingDays) * 100) / 100;

  // Find or create invoice for current month
  let { data: invoice } = await supabase
    .from("reseller_invoices")
    .select("*")
    .eq("reseller_id", params.reseller_id)
    .eq("month", monthKey)
    .maybeSingle();

  if (!invoice) {
    const maxDay = daysInMonth(year, month);
    const day = Math.min(dueDay, maxDay);
    const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const { data: newInvoice } = await supabase
      .from("reseller_invoices")
      .insert({
        reseller_id: params.reseller_id,
        month: monthKey,
        due_date: dueDate,
        total_value: 0,
        status: "pending",
      })
      .select()
      .single();

    invoice = newInvoice;
  }

  if (!invoice) {
    return jsonResponse({ error: "Failed to create invoice" }, 500);
  }

  // Add line items
  const items = [];

  // Activation fee
  if (activationFee > 0) {
    items.push({
      invoice_id: invoice.id,
      company_id: params.company_id,
      company_name: params.company_name,
      type: "activation",
      value: activationFee,
    });
  }

  // Prorated monthly
  items.push({
    invoice_id: invoice.id,
    company_id: params.company_id,
    company_name: params.company_name,
    type: "prorated",
    value: proratedValue,
    days_counted: remainingDays,
  });

  await supabase.from("reseller_invoice_items").insert(items);

  // Update invoice total
  const newTotal = Number(invoice.total_value) + activationFee + proratedValue;
  await supabase
    .from("reseller_invoices")
    .update({ total_value: newTotal })
    .eq("id", invoice.id);

  return jsonResponse({
    invoice_id: invoice.id,
    prorated_value: proratedValue,
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
