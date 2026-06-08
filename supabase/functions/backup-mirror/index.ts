import postgres from "npm:postgres@3.4.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BATCH_SIZE = 500;
const MAX_RUNTIME_MS = 140_000; // edge function limit é ~150s

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
  let expected = Deno.env.get("BACKUP_TRIGGER_SECRET") ?? "";
  // Fallback: ler do Vault da base de origem (mesma fonte usada pelo cron)
  if (!expected) {
    try {
      const srcUrl = Deno.env.get("SUPABASE_DB_URL");
      if (srcUrl) {
        const sMeta = postgres(srcUrl, { max: 1, prepare: false, connect_timeout: 10 });
        const rows = await sMeta`select decrypted_secret from vault.decrypted_secrets where name = 'BACKUP_TRIGGER_SECRET' limit 1`;
        await sMeta.end({ timeout: 2 });
        expected = (rows?.[0]?.decrypted_secret as string) ?? "";
      }
    } catch (_) { /* ignore */ }
  }
  if (!expected || provided !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const sourceUrl = Deno.env.get("SUPABASE_DB_URL");
  const targetUrl = Deno.env.get("BACKUP_TARGET_DB_URL");
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
    });
});