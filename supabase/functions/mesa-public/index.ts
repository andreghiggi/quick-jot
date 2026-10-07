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

/** Mesmo algoritmo do front (src/utils/comandaCode.ts). */
function parseComandaCode(raw: unknown): number | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 8) {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 3 : 1);
    if ((10 - (sum % 10)) % 10 === Number(digits[7])) return Number(digits.slice(0, 7)) || null;
    return null;
  }
  if (digits.length > 7) return null;
  const n = Number(digits);
  return n > 0 ? n : null;
}

async function comandaCardsActive(admin: any, companyId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("comanda_cards_active", { _company_id: companyId });
  if (error) {
    console.error("comanda_cards_active failed", error);
    return false;
  }
  return data === true;
}

// "Usar mesas numeradas" — rollout isolado (só Lancheria da I9).
const NUMBERED_TABLES_ALLOWED = new Set(["8c9e7a0e-dbb6-49b9-8344-c23155a71164"]);

/** true = loja usa mesas (padrão para todas as lojas fora da lista). */
async function numberedTablesOn(admin: any, companyId: string): Promise<boolean> {
  if (!NUMBERED_TABLES_ALLOWED.has(companyId)) return true;
  const { data } = await admin
    .from("store_settings").select("value")
    .eq("company_id", companyId).eq("key", "numbered_tables_enabled").maybeSingle();
  return data?.value === "true";
}

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

      const comandaCards = await comandaCardsActive(admin, company.id);
      const numberedTables = await numberedTablesOn(admin, company.id);

      return json({
        companyId: company.id,
        companyName: company.name,
        moduleEnabled,
        comandaCards,
        numberedTables,
        mesas,
      });
    }

    if (action === "submit-order") {
      const companyId = String(payload?.companyId || "");
      const tableNumber = Number(payload?.tableNumber);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const productionTicketHtml: string | null = payload?.productionTicketHtml || null;
      const ticketLabel: string | null = payload?.ticketLabel || null;

      if (!companyId || items.length === 0) {
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

      // ---- Modo comanda individual (trava validada no servidor) ----
      const cardsActive = await comandaCardsActive(admin, companyId);
      const tablesOn = await numberedTablesOn(admin, companyId);
      // Só comandas (I9 com mesas desligado): não exige mesa.
      const comandaOnly = cardsActive && !tablesOn;

      let table: { id: string; number: number; status: string } | null = null;
      if (!comandaOnly) {
        if (!Number.isFinite(tableNumber)) return json({ error: "invalid_payload" }, 400);
        const { data: t } = await admin
          .from("tables")
          .select("id, number, status")
          .eq("company_id", companyId)
          .eq("number", tableNumber)
          .maybeSingle();
        if (!t) return json({ error: "table_not_found" }, 404);
        table = t;
      }

      const hasComandaField = payload?.comandaNumber !== undefined && payload?.comandaNumber !== null && payload?.comandaNumber !== "";
      if (hasComandaField && !cardsActive) {
        return json({ error: "comanda_cards_disabled" }, 403);
      }
      let cardTab: { id: string; tab_number: number } | null = null;
      if (cardsActive) {
        const comandaNumber = parseComandaCode(payload?.comandaNumber);
        if (!comandaNumber) return json({ error: "comanda_required" }, 400);
        const { data: openCard } = await admin
          .from("tabs")
          .select("id, tab_number, table_id")
          .eq("company_id", companyId)
          .eq("status", "open")
          .eq("comanda_number", comandaNumber)
          .maybeSingle();
        if (openCard && table && openCard.table_id !== table.id) {
          // Comanda aberta em outra mesa: não mexe, pede ao garçom.
          return json({ error: "comanda_in_other_table" }, 409);
        }
        if (openCard) {
          cardTab = { id: openCard.id, tab_number: openCard.tab_number };
        } else {
          const { data: lastTab } = await admin
            .from("tabs").select("tab_number").eq("company_id", companyId)
            .order("tab_number", { ascending: false }).limit(1).maybeSingle();
          const { data: newTab, error: tabErr } = await admin
            .from("tabs")
            .insert({
              company_id: companyId,
              table_id: table?.id ?? null,
              tab_number: (lastTab?.tab_number || 0) + 1,
              comanda_number: comandaNumber,
              customer_name: `Comanda ${String(comandaNumber).padStart(3, "0")} (QR)`,
              status: "open",
              created_by: "00000000-0000-0000-0000-000000000000",
            })
            .select("id, tab_number")
            .single();
          if (tabErr || !newTab) {
            console.error("create card tab failed", tabErr);
            return json({ error: tabErr?.code === "23505" ? "comanda_busy" : "create_tab_failed" }, tabErr?.code === "23505" ? 409 : 500);
          }
          cardTab = newTab;
          if (table) await admin.from("tables").update({ status: "occupied" }).eq("id", table.id);
        }
      }

      // Encontra ou cria comanda aberta (modo normal: 1 comanda por mesa)
      const { data: existingTab } = cardTab ? { data: cardTab } : await admin
        .from("tabs")
        .select("id, tab_number")
        .eq("company_id", companyId)
        .eq("table_id", table!.id)
        .eq("status", "open")
        .is("comanda_number", null)
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
            table_id: table!.id,
            tab_number: tabNumber,
            customer_name: `Mesa ${table!.number} (QR)`,
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
          .eq("id", table!.id);
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
          label: ticketLabel || (table ? `Mesa ${table.number} (QR) - Comanda #${tabNumber}` : `Comanda #${tabNumber} (QR)`),
        });
      }

      return json({ ok: true, tabId, tabNumber, tableNumber: table?.number ?? null });
    }

    if (action === "get-tab-items") {
      const companyId = String(payload?.companyId || "");
      const tableNumber = Number(payload?.tableNumber);
      if (!companyId || !Number.isFinite(tableNumber)) {
        return json({ error: "invalid_payload" }, 400);
      }

      const { data: table } = await admin
        .from("tables")
        .select("id, number")
        .eq("company_id", companyId)
        .eq("number", tableNumber)
        .maybeSingle();
      if (!table) return json({ ok: true, items: [], tabNumber: null });

      const cardsActive = await comandaCardsActive(admin, companyId);
      let tabQuery = admin
        .from("tabs")
        .select("id, tab_number, transfer_log")
        .eq("company_id", companyId)
        .eq("table_id", table.id)
        .eq("status", "open");
      if (cardsActive) {
        const comandaNumber = parseComandaCode(payload?.comandaNumber);
        if (!comandaNumber) return json({ ok: true, items: [], tabNumber: null });
        tabQuery = tabQuery.eq("comanda_number", comandaNumber);
      } else {
        tabQuery = tabQuery.is("comanda_number", null);
      }
      const { data: tab } = await tabQuery.maybeSingle();
      if (!tab) return json({ ok: true, items: [], tabNumber: null });

      const { data: items } = await admin
        .from("tab_items")
        .select("id, product_name, quantity, notes, created_at")
        .eq("tab_id", tab.id)
        .order("created_at", { ascending: true });

      return json({
        ok: true,
        tabNumber: tab.tab_number,
        transferLog: tab.transfer_log || [],
        items: (items || []).map((i) => ({
          id: i.id,
          productName: i.product_name,
          quantity: i.quantity,
          notes: i.notes,
        })),
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("mesa-public error", err);
    return json({ error: "internal_error", detail: String(err?.message || err) }, 500);
  }
});
