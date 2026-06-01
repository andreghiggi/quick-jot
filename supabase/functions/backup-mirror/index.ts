import postgres from "npm:postgres@3.4.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BATCH_SIZE = 500;
const MAX_RUNTIME_MS = 140_000; // edge function limit é ~150s

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: header x-backup-secret deve bater com BACKUP_TRIGGER_SECRET
  const provided = req.headers.get("x-backup-secret") ?? "";
  const expected = Deno.env.get("BACKUP_TRIGGER_SECRET") ?? "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sourceUrl = Deno.env.get("SUPABASE_DB_URL");
  const targetUrl = Deno.env.get("BACKUP_TARGET_DB_URL");
  if (!sourceUrl || !targetUrl) {
    return new Response(
      JSON.stringify({ error: "missing DB URLs" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const startedAt = Date.now();
  const source = postgres(sourceUrl, { max: 2, prepare: false });
  const target = postgres(targetUrl, { max: 2, prepare: false });

  // Log: cria registro 'running' (via target, mas vamos guardar no source também)
  const sourceMeta = postgres(sourceUrl, { max: 1, prepare: false });
  const [runRow] = await sourceMeta`
    INSERT INTO public.backup_runs (status) VALUES ('running') RETURNING id
  `;
  const runId = runRow.id as string;

  let tablesProcessed = 0;
  let totalRows = 0;
  let status = "success";
  let errorMessage: string | null = null;
  const perTable: Record<string, { rows: number; ms: number; error?: string }> = {};

  try {
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
      // Pula tabelas sem PK (não dá pra upsert) e backup_runs (pra não bagunçar)
      if (!pkCols || pkCols.length === 0 || table === "backup_runs") {
        perTable[table] = { rows: 0, ms: 0, error: "skip: sem PK ou tabela de log" };
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

        // Pagina a leitura
        const orderBy = pkCols.map((c) => `"${c}"`).join(",");
        let offset = 0;
        while (true) {
          if (Date.now() - startedAt > MAX_RUNTIME_MS) {
            throw new Error("timeout no meio da tabela");
          }
          const batch = await source.unsafe(
            `SELECT ${quotedCols} FROM public."${table}" ORDER BY ${orderBy} LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
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

  return new Response(
    JSON.stringify({
      run_id: runId,
      status,
      tables_processed: tablesProcessed,
      rows_copied: totalRows,
      duration_ms: durationMs,
      error_message: errorMessage,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});