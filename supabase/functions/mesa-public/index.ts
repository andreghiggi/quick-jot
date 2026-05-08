// Edge function pública (sem JWT) que serve o fluxo de Cardápio de Mesa via QR.
// Ações suportadas:
//   - bootstrap: { slug } -> retorna companyId, moduleEnabled, mesas (number+status)
//   - submit-order: { companyId, tableNumber, items[], productionTicketHtml? }
//                   cria/encontra comanda da mesa e adiciona itens.
//
// Roda com SERVICE_ROLE para validar dados (preço, mesa, módulo) sem expor o banco.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = String(payload?.action || "");

  try {
    if (action === "bootstrap") {
      const slug = String(payload?.slug || "").trim();
      if (!slug) return json({ error: "missing_slug" }, 400);

      // Lookup por slug OU subdomain
      const { data: company } = await admin
        .from("companies")
        .select("id, name, slug, subdomain")
        .or(`slug.eq.${slug},subdomain.eq.${slug}`)
        .eq("active", true)
        .maybeSingle();

      if (!company) return json({ error: "company_not_found" }, 404);

      const { data: moduleRow } = await admin
        .from("company_modules")
        .select("enabled")
        .eq("company_id", company.id)
        .eq("module_name", "cardapio_mesa")
        .maybeSingle();

      const moduleEnabled = !!moduleRow?.enabled;

      // Carrega mesas + status atual de comanda
      const { data: tables } = await admin
        .from("tables")
        .select("id, number, status")
        .eq("company_id", company.id)
        .order("number", { ascending: true });

      const { data: openTabs } = await admin
        .from("tabs")
        .select("id, table_id, tab_number")
        .eq("company_id", company.id)
        .eq("status", "open");

      const tabsByTable = new Map<string, { tabId: string; tabNumber: number }>();
      (openTabs || []).forEach((t) => {
        if (t.table_id) tabsByTable.set(t.table_id, { tabId: t.id, tabNumber: t.tab_number });
      });

      const mesas = (tables || []).map((t) => {
        const tab = tabsByTable.get(t.id);
        return {
          number: t.number,
          status: t.status,
          hasOpenTab: !!tab,
          tabNumber: tab?.tabNumber ?? null,
        };
      });

      return json({
        companyId: company.id,
        companyName: company.name,
        moduleEnabled,
        mesas,
      });
    }

    if (action === "submit-order") {
      const companyId = String(payload?.companyId || "");
      const tableNumber = Number(payload?.tableNumber);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const productionTicketHtml: string | null = payload?.productionTicketHtml || null;
      const ticketLabel: string | null = payload?.ticketLabel || null;

      if (!companyId || !Number.isFinite(tableNumber) || items.length === 0) {
        return json({ error: "invalid_payload" }, 400);
      }

      // Reconfere módulo habilitado (segurança)
      const { data: moduleRow } = await admin
        .from("company_modules")
        .select("enabled")
        .eq("company_id", companyId)
        .eq("module_name", "cardapio_mesa")
        .maybeSingle();
      if (!moduleRow?.enabled) return json({ error: "module_disabled" }, 403);

      // Mesa válida?
      const { data: table } = await admin
        .from("tables")
        .select("id, number, status")
        .eq("company_id", companyId)
        .eq("number", tableNumber)
        .maybeSingle();
      if (!table) return json({ error: "table_not_found" }, 404);

      // Encontra ou cria comanda aberta
      const { data: existingTab } = await admin
        .from("tabs")
        .select("id, tab_number")
        .eq("company_id", companyId)
        .eq("table_id", table.id)
        .eq("status", "open")
        .maybeSingle();

      let tabId: string;
      let tabNumber: number;
      const SYSTEM_USER = "00000000-0000-0000-0000-000000000000";

      if (existingTab) {
        tabId = existingTab.id;
        tabNumber = existingTab.tab_number;
      } else {
        const { data: lastTab } = await admin
          .from("tabs")
          .select("tab_number")
          .eq("company_id", companyId)
          .order("tab_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        tabNumber = (lastTab?.tab_number || 0) + 1;

        const { data: newTab, error: tabErr } = await admin
          .from("tabs")
          .insert({
            company_id: companyId,
            table_id: table.id,
            tab_number: tabNumber,
            customer_name: `Mesa ${table.number} (QR)`,
            status: "open",
            created_by: SYSTEM_USER,
          })
          .select("id")
          .single();
        if (tabErr || !newTab) {
          console.error("create tab failed", tabErr);
          return json({ error: "create_tab_failed" }, 500);
        }
        tabId = newTab.id;

        // Marca mesa como ocupada
        await admin
          .from("tables")
          .update({ status: "occupied" })
          .eq("id", table.id);
      }

      // Valida e insere itens — re-confere preço dos produtos no servidor
      const productIds = Array.from(
        new Set(items.map((i: any) => i?.productId).filter(Boolean)),
      );
      const { data: dbProducts } = await admin
        .from("products")
        .select("id, name, price, company_id, active, waiter_item")
        .in("id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);
      const productMap = new Map<string, any>();
      (dbProducts || []).forEach((p) => productMap.set(p.id, p));

      const inserts: any[] = [];
      for (const it of items) {
        const productName = String(it?.productName || "").trim();
        const quantity = Math.max(1, Number(it?.quantity || 1));
        const notes = it?.notes ? String(it.notes) : null;
        // Preço enviado pelo cliente inclui adicionais. Validamos só o produto base.
        const dbp = it?.productId ? productMap.get(it.productId) : null;
        if (it?.productId) {
          if (!dbp || dbp.company_id !== companyId || !dbp.active || dbp.waiter_item === false) {
            return json({ error: "invalid_product", productId: it.productId }, 400);
          }
        }
        const unitPrice = Number(it?.unitPrice);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          return json({ error: "invalid_price" }, 400);
        }
        // Sanity: o preço não pode ser MENOR que o do banco (evita manipulação para baixo)
        if (dbp && unitPrice + 0.001 < Number(dbp.price)) {
          return json({ error: "price_mismatch", productId: it.productId }, 400);
        }
        inserts.push({
          tab_id: tabId,
          product_id: it?.productId || null,
          product_name: productName,
          quantity,
          unit_price: unitPrice,
          total_price: unitPrice * quantity,
          notes,
          created_by: SYSTEM_USER,
        });
      }

      const { error: itemsErr } = await admin.from("tab_items").insert(inserts);
      if (itemsErr) {
        console.error("insert tab_items failed", itemsErr);
        return json({ error: "insert_items_failed" }, 500);
      }

      // Print queue (opcional)
      if (productionTicketHtml) {
        await admin.from("print_queue").insert({
          company_id: companyId,
          html_content: productionTicketHtml,
          label: ticketLabel || `Mesa ${table.number} (QR) - Comanda #${tabNumber}`,
        });
      }

      return json({ ok: true, tabId, tabNumber, tableNumber: table.number });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("mesa-public error", err);
    return json({ error: "internal_error", detail: String(err?.message || err) }, 500);
  }
});
