import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const TOKEN = Deno.env.get("ROLLBACK_SYNC_TOKEN") || "comanda-rollback-2026-vps";
const VPS_URL = Deno.env.get("VPS_SUPABASE_URL") || "https://api.comandatech.com.br";

const TABLES = [
  "companies", "profiles", "user_roles", "company_users", "company_modules", "company_plans",
  "store_settings", "payment_methods", "categories", "products", "optional_groups", "optionals",
  "optional_group_categories", "optional_group_products", "orders", "order_items",
  "nfce_records", "pdv_sales", "pdv_sale_items", "pdv_sale_payments",
  "cash_registers", "cash_movements", "customers", "customer_addresses",
];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function upsertRows(sql: ReturnType<typeof postgres>, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  const quotedCols = cols.map((c) => `"${c}"`).join(",");
  const pkRows = await sql`
    SELECT kcu.column_name FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = ${table} AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `;
  const pkCols = pkRows.map((r) => r.column_name as string);
  if (!pkCols.length) throw new Error(`no pk: ${table}`);

  let upserted = 0;
  const chunk = 100;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    const placeholders: string[] = [];
    const flat: unknown[] = [];
    let p = 1;
    for (const row of batch) {
      const ph: string[] = [];
      for (const c of cols) {
        ph.push(`$${p++}`);
        flat.push(row[c] ?? null);
      }
      placeholders.push(`(${ph.join(",")})`);
    }
    const conflictCols = pkCols.map((c) => `"${c}"`).join(",");
    const updateCols = cols.filter((c) => !pkCols.includes(c)).map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
    const q = `INSERT INTO public."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`;
    await sql.unsafe(q, flat);
    upserted += batch.length;
  }
  return upserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if ((req.headers.get("x-rollback-token") ?? "") !== TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return json({ error: "missing SUPABASE_DB_URL" }, 500);

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const vpsKey = (body?.vps_service_key as string) || Deno.env.get("VPS_SERVICE_ROLE_KEY") || "";
  if (!vpsKey) return json({ error: "missing vps_service_key" }, 400);

  const table = String(body?.table ?? "");
  const syncAll = body?.sync_all === true;
  const targets = syncAll ? TABLES : table ? [table] : [];
  if (!targets.length) return json({ error: "inform table or sync_all" }, 400);

  const vps = createClient(VPS_URL, vpsKey, { auth: { persistSession: false } });
  const sql = postgres(dbUrl, { max: 3, prepare: false, connect_timeout: 20 });
  const report: Record<string, number | string> = {};

  try {
    await sql`SET session_replication_role = 'replica'`;

    if (body?.sync_auth === true) {
      report.auth = "skip: use npm run mirror-auth com SOURCE_DB_URL=VPS e TARGET_DB_URL=Lovable";
    }

    for (const t of targets) {
      const rows: Record<string, unknown>[] = [];
      let from = 0;
      const page = 500;
      while (true) {
        const { data, error } = await vps.from(t).select("*").range(from, from + page - 1);
        if (error) throw new Error(`${t}: ${error.message}`);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < page) break;
        from += page;
      }
      report[t] = await upsertRows(sql, t, rows);
    }

    await sql`SET session_replication_role = 'origin'`;
    await sql.end();
    return json({ ok: true, report });
  } catch (e) {
    await sql.end({ timeout: 2 }).catch(() => {});
    return json({ error: e instanceof Error ? e.message : String(e), report }, 500);
  }
});
