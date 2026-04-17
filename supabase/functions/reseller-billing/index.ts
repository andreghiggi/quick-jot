import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

/**
 * Reseller Billing Edge Function — Per-store invoices
 *
 * Actions:
 * - generate_invoices: Generate the current month's invoice for each active store of every reseller (cron, 1st of month)
 * - backfill_invoices: Generate ALL retroactive invoices for every active store, from activation date until today
 *     (proportional for the activation month with due date in the FOLLOWING month, then full months)
 * - send_notifications: Send due-date reminders + suspend stores 3+ days overdue (cron, daily)
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

    const body = await req.json();
    const { action, reseller_id, company_id } = body;

    switch (action) {
      case "generate_invoices":
        return await generateCurrentMonthInvoices(supabase);

      case "backfill_invoices":
        return await backfillInvoices(supabase, { reseller_id, company_id });

      case "activation_invoice":
        return await createActivationInvoice(supabase, {
          reseller_id,
          company_id,
          payment_option: body.payment_option,
        });

      case "send_notifications":
        return await sendNotificationsAndProcess(supabase);

      case "process_overdue":
        return await processOverdue(supabase);

      default:
        return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (error: any) {
    console.error("Billing error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});

// ── Helpers ──

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[month - 1]} ${year}`;
}

/** Due date for a reference month is the (dueDay) of the SAME month. */
function buildDueDate(year: number, month: number, dueDay: number): string {
  // month is 1-indexed
  const day = Math.min(dueDay, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function getActivationDate(supabase: any, companyId: string): Promise<Date | null> {
  // Try plan first
  const { data: plan } = await supabase
    .from("company_plans")
    .select("activated_at, starts_at")
    .eq("company_id", companyId)
    .maybeSingle();
  const dateStr = plan?.activated_at || plan?.starts_at;
  if (dateStr) return new Date(dateStr);

  // Fallback to company creation
  const { data: company } = await supabase
    .from("companies")
    .select("created_at")
    .eq("id", companyId)
    .maybeSingle();
  return company?.created_at ? new Date(company.created_at) : null;
}

async function ensureMonthlyInvoice(
  supabase: any,
  reseller: { id: string; settings: { monthly_fee: number; invoice_due_day: number } },
  company: { id: string; name: string; next_invoice_due_day?: number | null },
  year: number,
  month: number,
  activationDate: Date
): Promise<{ created: boolean; type: "monthly" | "prorated"; value: number } | null> {
  const monthKey = formatMonthKey(year, month);
  const monthlyFee = Number(reseller.settings.monthly_fee);
  // Per-company override takes precedence over the reseller default
  const dueDay = company.next_invoice_due_day ?? reseller.settings.invoice_due_day;
  const totalDays = daysInMonth(year, month);

  // Skip if invoice already exists for this store/month
  const { data: existing } = await supabase
    .from("reseller_invoices")
    .select("id")
    .eq("company_id", company.id)
    .eq("month", monthKey)
    .maybeSingle();
  if (existing) return null;

  // Determine if proportional or full month
  const activationYear = activationDate.getFullYear();
  const activationMonth = activationDate.getMonth() + 1;

  let isFullMonth = true;
  let startDay = 1;
  if (activationYear === year && activationMonth === month) {
    startDay = activationDate.getDate();
    isFullMonth = startDay === 1;

    // Nova regra: se o cadastro é APÓS o dia de vencimento, pula a fatura
    // proporcional do mês de cadastro — a primeira fatura será a do mês seguinte (cheia).
    if (!isFullMonth && startDay > dueDay) {
      return null;
    }
  }

  const remainingDays = totalDays - startDay + 1;
  const value = isFullMonth
    ? monthlyFee
    : Math.round(((monthlyFee / totalDays) * remainingDays) * 100) / 100;
  const type: "monthly" | "prorated" = isFullMonth ? "monthly" : "prorated";

  const dueDate = buildDueDate(year, month, dueDay);

  const { data: invoice, error: invErr } = await supabase
    .from("reseller_invoices")
    .insert({
      reseller_id: reseller.id,
      company_id: company.id,
      month: monthKey,
      due_date: dueDate,
      total_value: value,
      status: "pending",
    })
    .select()
    .single();

  if (invErr) {
    console.error(`Error creating invoice ${reseller.id}/${company.id}/${monthKey}:`, invErr);
    return null;
  }

  await supabase.from("reseller_invoice_items").insert({
    invoice_id: invoice.id,
    company_id: company.id,
    company_name: company.name,
    type,
    value,
    days_counted: isFullMonth ? totalDays : remainingDays,
  });

  return { created: true, type, value };
}

// ── Actions ──

/** Generate just the CURRENT month invoice for all active stores (cron monthly). */
async function generateCurrentMonthInvoices(supabase: any) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

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
      .select("monthly_fee, invoice_due_day")
      .eq("reseller_id", reseller.id)
      .maybeSingle();

    const fullSettings = {
      monthly_fee: Number(settings?.monthly_fee ?? 29.90),
      invoice_due_day: settings?.invoice_due_day ?? 20,
    };

    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, active, next_invoice_due_day")
      .eq("reseller_id", reseller.id)
      .eq("active", true);

    if (!companies?.length) continue;

    for (const company of companies) {
      const activationDate = await getActivationDate(supabase, company.id);
      if (!activationDate) continue;

      const result = await ensureMonthlyInvoice(
        supabase,
        { id: reseller.id, settings: fullSettings },
        company,
        year,
        month,
        activationDate
      );
      if (result?.created) invoicesCreated++;
    }
  }

  return jsonResponse({ message: "Current-month invoices generated", invoices_created: invoicesCreated });
}

/** Backfill ALL invoices from activation date until today.
 * Optional filter: reseller_id and/or company_id.
 */
async function backfillInvoices(
  supabase: any,
  filter: { reseller_id?: string; company_id?: string }
) {
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;

  let resellerQuery = supabase.from("resellers").select("id, name").eq("status", "active");
  if (filter.reseller_id) resellerQuery = resellerQuery.eq("id", filter.reseller_id);
  const { data: resellers } = await resellerQuery;

  if (!resellers?.length) {
    return jsonResponse({ message: "No active resellers", invoices_created: 0 });
  }

  let invoicesCreated = 0;
  const detail: any[] = [];

  for (const reseller of resellers) {
    const { data: settings } = await supabase
      .from("reseller_settings")
      .select("monthly_fee, invoice_due_day")
      .eq("reseller_id", reseller.id)
      .maybeSingle();

    const fullSettings = {
      monthly_fee: Number(settings?.monthly_fee ?? 29.90),
      invoice_due_day: settings?.invoice_due_day ?? 20,
    };

    let companyQuery = supabase
      .from("companies")
      .select("id, name, active, next_invoice_due_day")
      .eq("reseller_id", reseller.id)
      .eq("active", true);
    if (filter.company_id) companyQuery = companyQuery.eq("id", filter.company_id);

    const { data: companies } = await companyQuery;
    if (!companies?.length) continue;

    for (const company of companies) {
      const activationDate = await getActivationDate(supabase, company.id);
      if (!activationDate) {
        detail.push({ company: company.name, skipped: "no activation date" });
        continue;
      }

      // Iterate from activation month to current month
      let y = activationDate.getFullYear();
      let m = activationDate.getMonth() + 1;

      // Hard safety: don't go more than 36 months back
      let safetyCount = 0;
      while ((y < todayYear || (y === todayYear && m <= todayMonth)) && safetyCount < 36) {
        const result = await ensureMonthlyInvoice(
          supabase,
          { id: reseller.id, settings: fullSettings },
          company,
          y,
          m,
          activationDate
        );
        if (result?.created) {
          invoicesCreated++;
          detail.push({
            company: company.name,
            month: formatMonthKey(y, m),
            label: getMonthLabel(formatMonthKey(y, m)),
            type: result.type,
            value: result.value,
          });
        }
        m++;
        if (m > 12) { m = 1; y++; }
        safetyCount++;
      }
    }
  }

  return jsonResponse({
    message: "Backfill completed",
    invoices_created: invoicesCreated,
    detail: detail.slice(0, 50), // truncate for response size
  });
}

async function sendNotificationsAndProcess(supabase: any) {
  const { data: processed } = await supabase.rpc("process_overdue_invoices");

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

    if (![5, 1, 0, -3].includes(diffDays)) continue;

    const reseller = invoice.resellers;
    const company = invoice.companies;
    if (!reseller?.phone) continue;

    const name = reseller.name.split(" ")[0];
    const formattedValue = Number(invoice.total_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const monthLabel = getMonthLabel(invoice.month);
    const portalLink = `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app")}/revendedor/lojas`;

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

/** Create activation invoice(s) for a newly created store.
 * payment_option:
 *   - "now"        : 1 invoice, due today + 3 days, no surcharge
 *   - "30_days"    : 1 invoice, due today + 30 days, +R$20 surcharge
 *   - "3x_no_entry": 3 invoices on the next 3 months (due day = reseller default), each + R$15
 *   - "3x_entry"   : entry today+3 days (no surcharge) + 2 invoices on the next 2 months (due day), each + R$15
 */
async function createActivationInvoice(
  supabase: any,
  params: { reseller_id: string; company_id: string; payment_option: string }
) {
  const { reseller_id, company_id, payment_option } = params;
  if (!reseller_id || !company_id || !payment_option) {
    return jsonResponse({ error: "reseller_id, company_id and payment_option required" }, 400);
  }

  const { data: reseller } = await supabase
    .from("resellers")
    .select("id")
    .eq("id", reseller_id)
    .maybeSingle();
  if (!reseller) return jsonResponse({ error: "Reseller not found" }, 404);

  const { data: settings } = await supabase
    .from("reseller_settings")
    .select("activation_fee, invoice_due_day")
    .eq("reseller_id", reseller_id)
    .maybeSingle();

  const activationFee = Number(settings?.activation_fee ?? 180);
  const resellerDueDay = settings?.invoice_due_day ?? 20;

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, next_invoice_due_day")
    .eq("id", company_id)
    .maybeSingle();
  if (!company) return jsonResponse({ error: "Company not found" }, 404);

  // Per-company override takes precedence over the reseller default
  const dueDay = company.next_invoice_due_day ?? resellerDueDay;

  // Skip if any activation invoice already exists for this company
  const { data: existing } = await supabase
    .from("reseller_invoice_items")
    .select("id")
    .eq("company_id", company_id)
    .eq("type", "activation")
    .limit(1);
  if (existing && existing.length > 0) {
    return jsonResponse({ message: "Activation invoice already exists", skipped: true });
  }

  const today = new Date();
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthDueDate = (refDate: Date, monthsAhead: number): Date => {
    const y = refDate.getFullYear();
    const m = refDate.getMonth() + 1 + monthsAhead;
    const yy = y + Math.floor((m - 1) / 12);
    const mm = ((m - 1) % 12) + 1;
    const day = Math.min(dueDay, daysInMonth(yy, mm));
    return new Date(`${yy}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00`);
  };

  const invoicesToCreate: Array<{
    due: Date;
    value: number;
    label: string;
    item_type: string;
    item_value: number;
  }> = [];

  if (payment_option === "now") {
    invoicesToCreate.push({
      due: addDays(today, 3),
      value: activationFee,
      label: "Taxa de ativação (à vista)",
      item_type: "activation",
      item_value: activationFee,
    });
  } else if (payment_option === "30_days") {
    invoicesToCreate.push({
      due: addDays(today, 30),
      value: activationFee + 20,
      label: "Taxa de ativação (30 dias) + acréscimo R$20",
      item_type: "activation",
      item_value: activationFee + 20,
    });
  } else if (payment_option === "3x_no_entry") {
    const partBase = Math.round((activationFee / 3) * 100) / 100;
    for (let i = 1; i <= 3; i++) {
      invoicesToCreate.push({
        due: nextMonthDueDate(today, i),
        value: partBase + 15,
        label: `Taxa de ativação ${i}/3 (parcelado) + acréscimo R$15`,
        item_type: "activation",
        item_value: partBase + 15,
      });
    }
  } else if (payment_option === "3x_entry") {
    const partBase = Math.round((activationFee / 3) * 100) / 100;
    invoicesToCreate.push({
      due: addDays(today, 3),
      value: partBase,
      label: "Taxa de ativação 1/3 (entrada à vista)",
      item_type: "activation",
      item_value: partBase,
    });
    for (let i = 1; i <= 2; i++) {
      invoicesToCreate.push({
        due: nextMonthDueDate(today, i),
        value: partBase + 15,
        label: `Taxa de ativação ${i + 1}/3 (parcelado) + acréscimo R$15`,
        item_type: "activation",
        item_value: partBase + 15,
      });
    }
  } else {
    return jsonResponse({ error: "Invalid payment_option" }, 400);
  }

  const created: string[] = [];
  for (const inv of invoicesToCreate) {
    const { data: invoice, error } = await supabase
      .from("reseller_invoices")
      .insert({
        reseller_id,
        company_id,
        month: monthKey(inv.due),
        due_date: isoDate(inv.due),
        total_value: inv.value,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating activation invoice:", error);
      continue;
    }

    await supabase.from("reseller_invoice_items").insert({
      invoice_id: invoice.id,
      company_id,
      company_name: company.name,
      type: inv.item_type,
      value: inv.item_value,
    });

    created.push(invoice.id);
  }

  return jsonResponse({
    message: "Activation invoice(s) created",
    created_count: created.length,
    invoice_ids: created,
    payment_option,
  });
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
