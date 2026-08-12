import postgres from "npm:postgres@3.4.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { mirrorAuth } from "./mirror-auth.ts";

const BATCH_SIZE = 1000;
const MAX_RUNTIME_MS = 50_000;
const MAX_TABLES_PER_INVOCATION = 8;

const SKIP_TABLES = new Set<string>([
  "backup_runs",
  "tef_webservice_logs",
  "pinpdv_logs",
  "whatsapp_auto_reply_locks",
]);

const LOGIN_PRIORITY_TABLES = [
  "companies",
  "profiles",
  "user_roles",
  "company_users",
  "resellers",
  "reseller_settings",
  "reseller_companies",
];

const RECENT_ONLY_TABLES: Record<string, { column: string; days: number }> = {
  whatsapp_messages: { column: "created_at", days: 90 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  let body: any = {};
  if (req.method === "POST") {
    const rawBody = await req.text();
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error("Error parsing JSON body:", e);
    }
  }

  const provided = req.headers.get("x-backup-secret") ?? "";
  let expected = "";
  try {
    const srcUrl = Deno.env.get("SUPABASE_DB_URL");
    if (srcUrl) {
      const sMeta = postgres(srcUrl, { max: 1, prepare: false, connect_timeout: 10 });
      const rows = await sMeta`select decrypted_secret from vault.decrypted_secrets where name = 'BACKUP_TRIGGER_SECRET' limit 1`;
      await sMeta.end({ timeout: 2 });
      expected = (rows?.[0]?.decrypted_secret as string) ?? "";
    }
  } catch (_) { /* ignore */ }
  if (!expected) expected = Deno.env.get("BACKUP_TRIGGER_SECRET") ?? "";
  
  const isSkipAuth = body?.skip_auth === true;
  const isContinuation = typeof body?.run_id === "string" && body.run_id.length > 0;
  const isAuthOnly = body?.mode === "auth-only";
  const isLoginOnly = body?.mode === "login-tables-only";

  if (!isAuthOnly && !isLoginOnly && !isSkipAuth && !isContinuation && (!expected || provided !== expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const sourceUrl = Deno.env.get("SUPABASE_DB_URL");
  let targetUrl = "";
  try {
    if (sourceUrl) {
      const sMeta = postgres(sourceUrl, { max: 1, prepare: false, connect_timeout: 10 });
      const rows = await sMeta`select decrypted_secret from vault.decrypted_secrets where name = 'BACKUP_TARGET_DB_URL_VAULT' limit 1`;
      await sMeta.end({ timeout: 2 });
      targetUrl = (rows?.[0]?.decrypted_secret as string) ?? "";
    }
  } catch (_) { /* ignore */ }
  if (!targetUrl) targetUrl = Deno.env.get("BACKUP_TARGET_DB_URL") ?? "";
  if (!sourceUrl || !targetUrl) return json({ error: "missing DB URLs" }, 500);

  const startedAt = Date.now();
  const source = postgres(sourceUrl, { max: 5, prepare: false });
  const target = postgres(targetUrl, { max: 5, prepare: false });
  const sourceMeta = postgres(sourceUrl, { max: 1, prepare: false });

  try {
    await target`SET session_replication_role = 'replica'`;
  } catch (_) { /* ignore */ }

  const sendNotify = async (text: string) => {
    try {
      const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
      const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
      if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
        const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
        await fetch(`${baseUrl}/message/sendText/ct-8c9e7a0e`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({ number: "5554999061836", text }),
        });
      }
    } catch (_) { /* ignore */ }
  };

  async function mirrorTable(table: string, pkCols: string[]) {
    const cols = await source`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=${table}
      ORDER BY ordinal_position
    `;
    const colNames = cols.map((c) => c.column_name as string);
    const quotedCols = colNames.map((c) => `"${c}"`).join(",");
    const orderBy = pkCols.map((c) => `"${c}"`).join(",");
    const recent = RECENT_ONLY_TABLES[table];
    const whereClause = recent ? `WHERE "${recent.column}" >= now() - interval '${recent.days} days'` : "";

    if (recent) {
      await target.unsafe(`DELETE FROM public."${table}" WHERE "${recent.column}" >= now() - interval '${recent.days} days'`);
    } else {
      await target.unsafe(`DELETE FROM public."${table}"`);
    }

    let rowsForTable = 0;
    let offset = 0;
    while (true) {
      if (Date.now() - startedAt > MAX_RUNTIME_MS) break;
      const batch = await source.unsafe(
        `SELECT ${quotedCols} FROM public."${table}" ${whereClause} ORDER BY ${orderBy} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
      );
      if (batch.length === 0) break;

      const placeholders: string[] = [];
      const flatValues: unknown[] = [];
      let p = 1;
      for (const row of batch) {
        const ph: string[] = [];
        for (const c of colNames) {
          ph.push(`$${p++}`);
          flatValues.push(row[c]);
        }
        placeholders.push(`(${ph.join(",")})`);
      }
      const conflictCols = pkCols.map((c) => `"${c}"`).join(",");
      const sql = `INSERT INTO public."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO NOTHING`;
      await target.unsafe(sql, flatValues);
      rowsForTable += batch.length;
      offset += BATCH_SIZE;
      if (batch.length < BATCH_SIZE) break;
    }
    return rowsForTable;
  }

  // 1. Auth Only
  if (isAuthOnly) {
    const authResult = await mirrorAuth(source, target, sendNotify);
    const authOk = authResult.errors.length === 0;
    const [runRow] = await sourceMeta`
      INSERT INTO public.backup_runs (status, rows_copied, error_message, details)
      VALUES (${authOk ? 'success' : 'error'}, ${authResult.users + authResult.identities}, ${authOk ? null : authResult.errors.join('; ')}, ${sourceMeta.json({ auth: authResult })})
      RETURNING id
    `;
    await source.end(); await target.end(); await sourceMeta.end();
    return json({ ok: authOk, run_id: runRow.id, auth: authResult });
  }

  // 2. Login Only
  if (isLoginOnly) {
    const perTable: any = {};
    let totalRows = 0;
    const errors: string[] = [];
    
    // Get PKs for these tables
    const pkData = await source`
      SELECT t.table_name, array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS pk_cols
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = ANY(${LOGIN_PRIORITY_TABLES}) AND tc.constraint_type = 'PRIMARY KEY'
      GROUP BY t.table_name
    `;
    const pkMap = new Map(pkData.map(r => [r.table_name, r.pk_cols]));

    for (const table of LOGIN_PRIORITY_TABLES) {
      const pk = pkMap.get(table) as string[];
      if (!pk) continue;
      try {
        const rows = await mirrorTable(table, pk);
        perTable[table] = { rows };
        totalRows += rows;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${table}: ${msg}`);
        perTable[table] = { rows: 0, error: msg };
      }
    }

    const [runRow] = await sourceMeta`
      INSERT INTO public.backup_runs (status, tables_processed, rows_copied, error_message, details)
      VALUES (${errors.length === 0 ? 'success' : 'error'}, ${LOGIN_PRIORITY_TABLES.length}, ${totalRows}, ${errors.length === 0 ? null : errors.join('; ')}, ${sourceMeta.json(perTable)})
      RETURNING id
    `;
    await source.end(); await target.end(); await sourceMeta.end();
    return json({ ok: errors.length === 0, run_id: runRow.id, processed: perTable });
  }

  // 3. Full / Skip Auth Chain
  let runId = body.run_id || "";
  let tablesProcessed = 0;
  let totalRows = 0;
  let perTable: any = {};
  let startAfter = body.start_after || null;

  if (runId) {
    const [prev] = await sourceMeta`SELECT tables_processed, rows_copied, details FROM public.backup_runs WHERE id = ${runId}`;
    if (prev) {
      tablesProcessed = prev.tables_processed;
      totalRows = prev.rows_copied;
      perTable = prev.details || {};
    }
  } else {
    // Clear old stuck runs
    await sourceMeta`UPDATE public.backup_runs SET status = 'error', error_message = 'chain interrompida' WHERE status = 'running' AND started_at < now() - interval '30 minutes'`;
    const [runRow] = await sourceMeta`INSERT INTO public.backup_runs (status) VALUES ('running') RETURNING id`;
    runId = runRow.id;
  }

  const tables = await source`
    SELECT t.table_name, (
      SELECT array_agg(kcu.column_name ORDER BY kcu.ordinal_position)
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = t.table_name AND tc.constraint_type = 'PRIMARY KEY'
    ) AS pk_cols
    FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' ORDER BY t.table_name
  `;

  let processedCount = 0;
  let hasMore = false;
  let lastTable = startAfter;

  for (const t of tables) {
    const table = t.table_name as string;
    if (startAfter && table <= startAfter) continue;
    if (processedCount >= MAX_TABLES_PER_INVOCATION || Date.now() - startedAt > MAX_RUNTIME_MS) {
      hasMore = true;
      break;
    }

    const pk = t.pk_cols as string[];
    if (!pk || pk.length === 0 || SKIP_TABLES.has(table)) {
      lastTable = table; processedCount++; continue;
    }

    try {
      const rows = await mirrorTable(table, pk);
      perTable[table] = { rows };
      totalRows += rows;
      tablesProcessed++;
    } catch (e) {
      perTable[table] = { rows: 0, error: e instanceof Error ? e.message : String(e) };
    }
    lastTable = table;
    processedCount++;
  }

  await sourceMeta`
    UPDATE public.backup_runs SET 
      status = ${hasMore ? 'running' : 'success'},
      tables_processed = ${tablesProcessed},
      rows_copied = ${totalRows},
      details = ${sourceMeta.json(perTable)},
      finished_at = ${hasMore ? null : sourceMeta`now()`}
    WHERE id = ${runId}
  `;

  if (hasMore) {
    const baseUrl = req.url.split('?')[0];
    fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-backup-secret': provided },
      body: JSON.stringify({ run_id: runId, start_after: lastTable, skip_auth: true })
    }).catch(console.error);
  }

  await source.end(); await target.end(); await sourceMeta.end();
  return json({ ok: true, run_id: runId, has_more: hasMore, last_table: lastTable });
});