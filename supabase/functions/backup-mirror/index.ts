import postgres from "npm:postgres@3.4.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Limites por invocação (mantidos baixos pra caber no CPU budget da edge function).
// O backup é fatiado: cada chamada processa algumas tabelas e dispara a próxima via fetch.
const BATCH_SIZE = 1000;
const MAX_RUNTIME_MS = 30_000;
const MAX_TABLES_PER_INVOCATION = 8;

// Tabelas que NÃO devem ser espelhadas (logs voláteis e/ou pesados demais)
const SKIP_TABLES = new Set<string>([
  "backup_runs",
  "tef_webservice_logs",
  "pinpdv_logs",
  "whatsapp_auto_reply_locks",
]);

// Tabelas grandes onde só copiamos os últimos N dias
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

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  // Modo test-notify: só dispara mensagem de teste no WhatsApp, sem tocar no banco.
  // Não exige secret pois é inofensivo (só envia 1 mensagem fixa para o admin).
  if (body?.mode === "test-notify") {
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return json({ ok: false, error: "Evolution API não configurada" }, 500);
    }
    const nowBrt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const text = `🧪 *Teste de notificação*\n` +
      `Backup Comanda Tech\n` +
      `Hora: ${nowBrt}\n\n` +
      `Se você recebeu isso, as notificações diárias do backup vão chegar aqui ✅`;
    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
    const resp = await fetch(`${baseUrl}/message/sendText/ct-8c9e7a0e`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: "5554999061836", text }),
    });
    const respText = await resp.text();
    return json({ ok: resp.ok, status: resp.status, response: respText.slice(0, 500) });
  }

  // Auth: header x-backup-secret deve bater com BACKUP_TRIGGER_SECRET
  const provided = req.headers.get("x-backup-secret") ?? "";
  // Fonte da verdade: Vault da base de origem (mesma usada pelo cron).
  // Fallback: env var BACKUP_TRIGGER_SECRET (compat).
  let expected = "";
  let vaultErr = "";
  let vaultLen = 0;
  try {
    const srcUrl = Deno.env.get("SUPABASE_DB_URL");
    if (srcUrl) {
      const sMeta = postgres(srcUrl, { max: 1, prepare: false, connect_timeout: 10 });
      const rows = await sMeta`select decrypted_secret from vault.decrypted_secrets where name = 'BACKUP_TRIGGER_SECRET' limit 1`;
      await sMeta.end({ timeout: 2 });
      expected = (rows?.[0]?.decrypted_secret as string) ?? "";
      vaultLen = expected.length;
    }
  } catch (e) { vaultErr = e instanceof Error ? e.message : String(e); }
  if (!expected) expected = Deno.env.get("BACKUP_TRIGGER_SECRET") ?? "";
  if (!expected || provided !== expected) {
    return json({ error: "unauthorized", vaultLen, vaultErr, providedLen: provided.length, expectedLen: expected.length }, 401);
  }

  const sourceUrl = Deno.env.get("SUPABASE_DB_URL");
  // Fonte da verdade: Vault da base de origem (mais fácil de manter sem formulário)
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
  if (!sourceUrl || !targetUrl) {
    return json({ error: "missing DB URLs" }, 500);
  }

  if (body?.mode === "health") {
    const sourceHealth = postgres(sourceUrl, { max: 1, prepare: false, connect_timeout: 10 });
    const targetHealth = postgres(targetUrl, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await sourceHealth`select 1`;
      await targetHealth`select 1`;
      return json({ ok: true, source: "connected", target: "connected" });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    } finally {
      await sourceHealth.end({ timeout: 2 });
      await targetHealth.end({ timeout: 2 });
    }
  }

  const startedAt = Date.now();
  const source = postgres(sourceUrl, { max: 2, prepare: false, connect_timeout: 10, idle_timeout: 10 });
  const target = postgres(targetUrl, { max: 2, prepare: false, connect_timeout: 10, idle_timeout: 10 });

  // Estado da execução (pode ser continuação de uma invocação anterior)
  const sourceMeta = postgres(sourceUrl, { max: 1, prepare: false });
  const isContinuation = typeof body?.run_id === "string" && body.run_id.length > 0;
  const startAfterTable: string | null = typeof body?.start_after === "string" ? body.start_after : null;
  let runId: string;
  let tablesProcessed = 0;
  let totalRows = 0;
  let status = "success";
  let errorMessage: string | null = null;
  let perTable: Record<string, { rows: number; ms: number; error?: string }> = {};
  let schemaChanges: string[] = [];

  if (isContinuation) {
    runId = body.run_id;
    const [prev] = await sourceMeta`
      SELECT tables_processed, rows_copied, error_message, details
      FROM public.backup_runs WHERE id = ${runId}
    `;
    if (prev) {
      tablesProcessed = Number(prev.tables_processed ?? 0);
      totalRows = Number(prev.rows_copied ?? 0);
      errorMessage = (prev.error_message as string | null) ?? null;
      const det = prev.details as any;
      if (det && typeof det === "object") perTable = det;
    }
  } else {
    const [runRow] = await sourceMeta`
      INSERT INTO public.backup_runs (status) VALUES ('running') RETURNING id
    `;
    runId = runRow.id as string;
  }

  // Auto-sync de schema: cria tabelas/colunas novas no destino antes do mirror
  async function syncSchema() {
    const srcCols = await source`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
             character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema='public'
      ORDER BY table_name, ordinal_position
    `;
    const srcPks = await source`
      SELECT tc.table_name,
             array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS pk_cols
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'
      GROUP BY tc.table_name
    `;
    const pkMap = new Map<string, string[]>(srcPks.map((r: any) => [r.table_name, r.pk_cols]));

    const tgtCols = await target`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema='public'
    `;
    const tgtTableCols = new Map<string, Set<string>>();
    for (const r of tgtCols) {
      const t = r.table_name as string;
      if (!tgtTableCols.has(t)) tgtTableCols.set(t, new Set());
      tgtTableCols.get(t)!.add(r.column_name as string);
    }

    // Agrupa colunas da origem por tabela
    const srcTableCols = new Map<string, any[]>();
    for (const r of srcCols) {
      const t = r.table_name as string;
      if (!srcTableCols.has(t)) srcTableCols.set(t, []);
      srcTableCols.get(t)!.push(r);
    }

    const colDef = (c: any) => {
      let type = c.data_type as string;
      if (type === "USER-DEFINED" || type === "ARRAY") type = c.udt_name; // enums/arrays
      if (type === "character varying" && c.character_maximum_length) type = `varchar(${c.character_maximum_length})`;
      if (type === "numeric" && c.numeric_precision) type = `numeric(${c.numeric_precision},${c.numeric_scale ?? 0})`;
      let def = `"${c.column_name}" ${type}`;
      if (c.is_nullable === "NO") def += " NOT NULL";
      if (c.column_default) def += ` DEFAULT ${c.column_default}`;
      return def;
    };

    for (const [table, cols] of srcTableCols) {
      if (table === "backup_runs") continue;
      if (!tgtTableCols.has(table)) {
        // CREATE TABLE
        const pk = pkMap.get(table);
        const parts = cols.map(colDef);
        if (pk && pk.length) parts.push(`PRIMARY KEY (${pk.map((c) => `"${c}"`).join(",")})`);
        const ddl = `CREATE TABLE public."${table}" (${parts.join(", ")})`;
        try {
          await target.unsafe(ddl);
          schemaChanges.push(`CREATE ${table}`);
        } catch (e) {
          schemaChanges.push(`ERR CREATE ${table}: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        // ADD missing COLUMNs
        const existing = tgtTableCols.get(table)!;
        for (const c of cols) {
          if (!existing.has(c.column_name)) {
            const ddl = `ALTER TABLE public."${table}" ADD COLUMN ${colDef(c).replace(/ NOT NULL/, "")}`;
            try {
              await target.unsafe(ddl);
              schemaChanges.push(`ADD ${table}.${c.column_name}`);
            } catch (e) {
              schemaChanges.push(`ERR ADD ${table}.${c.column_name}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      }
    }
  }

  try {
    // 0) Sincroniza schema (tabelas/colunas novas) antes de copiar dados
    try { await syncSchema(); } catch (e) {
      schemaChanges.push(`syncSchema error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 1) Lista tabelas do public na origem com PK
    const tables = await source`
      SELECT
        t.table_name,
        (
          SELECT array_agg(kcu.column_name ORDER BY kcu.ordinal_position)
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = t.table_name
            AND tc.constraint_type = 'PRIMARY KEY'
        ) AS pk_cols
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `;

    for (const t of tables) {
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        status = "partial";
        errorMessage = "timeout: nem todas as tabelas foram processadas";
        break;
      }
      const table = t.table_name as string;
      const pkCols = (t.pk_cols ?? []) as string[] | null;
      // Pula tabelas sem PK (não dá pra upsert) e tabelas de log voláteis
      if (!pkCols || pkCols.length === 0 || SKIP_TABLES.has(table)) {
        perTable[table] = { rows: 0, ms: 0, error: "skip: sem PK ou tabela ignorada" };
        continue;
      }

      const tStart = Date.now();
      let rowsForTable = 0;
      try {
        // Pega lista de colunas
        const cols = await source`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name=${table}
          ORDER BY ordinal_position
        `;
        const colNames = cols.map((c) => c.column_name as string);
        const quotedCols = colNames.map((c) => `"${c}"`).join(",");
        const updateSet = colNames
          .filter((c) => !pkCols.includes(c))
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(",");
        const conflictCols = pkCols.map((c) => `"${c}"`).join(",");

        // Pagina a leitura (com filtro opcional pra tabelas grandes)
        const orderBy = pkCols.map((c) => `"${c}"`).join(",");
        const recent = RECENT_ONLY_TABLES[table];
        const whereClause = recent
          ? `WHERE "${recent.column}" >= now() - interval '${recent.days} days'`
          : "";
        let offset = 0;
        while (true) {
          if (Date.now() - startedAt > MAX_RUNTIME_MS) {
            throw new Error("timeout no meio da tabela");
          }
          const batch = await source.unsafe(
            `SELECT ${quotedCols} FROM public."${table}" ${whereClause} ORDER BY ${orderBy} LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
          );
          if (batch.length === 0) break;

          // Monta INSERT ... ON CONFLICT
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
          const sql = updateSet.length > 0
            ? `INSERT INTO public."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateSet}`
            : `INSERT INTO public."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO NOTHING`;

          await target.unsafe(sql, flatValues);
          rowsForTable += batch.length;
          offset += BATCH_SIZE;
          if (batch.length < BATCH_SIZE) break;
        }

        perTable[table] = { rows: rowsForTable, ms: Date.now() - tStart };
        totalRows += rowsForTable;
        tablesProcessed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        perTable[table] = { rows: rowsForTable, ms: Date.now() - tStart, error: msg };
        status = status === "success" ? "partial" : status;
        errorMessage = (errorMessage ? errorMessage + "; " : "") + `${table}: ${msg}`;
      }
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
  } finally {
    await source.end({ timeout: 5 });
    await target.end({ timeout: 5 });
  }

  const durationMs = Date.now() - startedAt;

  // Atualiza log
  try {
    await sourceMeta`
      UPDATE public.backup_runs
      SET finished_at = now(),
          status = ${status},
          tables_processed = ${tablesProcessed},
          rows_copied = ${totalRows},
          duration_ms = ${durationMs},
          error_message = ${errorMessage},
          details = ${sourceMeta.json(perTable)}
      WHERE id = ${runId}
    `;
  } catch (_) {
    // ignore
  } finally {
    await sourceMeta.end({ timeout: 5 });
  }

  // Notifica admin via WhatsApp (Evolution API, instância Lancheria da i9)
  try {
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
    if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      const nowBrt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const emoji = status === "success" ? "✅" : status === "partial" ? "⚠️" : "❌";
      const text = `${emoji} *Backup Comanda Tech*\n` +
        `Status: ${status}\n` +
        `Data: ${nowBrt}\n` +
        `Tabelas: ${tablesProcessed}\n` +
        `Linhas: ${totalRows.toLocaleString("pt-BR")}\n` +
        `Duração: ${(durationMs / 1000).toFixed(1)}s` +
        (errorMessage ? `\nErro: ${errorMessage.slice(0, 200)}` : "");

      const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
      await fetch(`${baseUrl}/message/sendText/ct-8c9e7a0e`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ number: "5554999061836", text }),
      });
    }
  } catch (_) {
    // não falhar o backup por causa da notificação
  }

  return json({
      run_id: runId,
      status,
      tables_processed: tablesProcessed,
      rows_copied: totalRows,
      duration_ms: durationMs,
      error_message: errorMessage,
      schema_changes: schemaChanges,
    });
});