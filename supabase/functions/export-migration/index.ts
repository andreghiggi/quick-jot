import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import postgres from "npm:postgres@3.4.4";

const TOKEN = "comanda-mig-2026-vps";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if ((req.headers.get("x-migration-token") ?? "") !== TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return json({ error: "missing SUPABASE_DB_URL" }, 500);

  const url = new URL(req.url);
  const listOnly = url.searchParams.get("list") === "1";

  const sql = postgres(dbUrl, { max: 5, prepare: false, connect_timeout: 20 });

  // POST: import UPSERT (rollback VPS → Lovable)
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const table = String(body?.table ?? "");
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!table || !/^[a-z_][a-z0-9_]*$/i.test(table)) {
      await sql.end();
      return json({ error: "invalid table" }, 400);
    }
    if (!rows.length) {
      await sql.end();
      return json({ ok: true, upserted: 0 });
    }
    try {
      await sql`SET session_replication_role = 'replica'`;
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
      if (!pkCols.length) throw new Error("no pk");
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
        await sql.unsafe(
          `INSERT INTO public."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`,
          flat,
        );
        upserted += batch.length;
      }
      await sql`SET session_replication_role = 'origin'`;
      await sql.end();
      return json({ ok: true, table, upserted });
    } catch (err) {
      await sql.end({ timeout: 2 }).catch(() => {});
      return json({ error: (err as Error).message }, 500);
    }
  }

  const only = url.searchParams.get("table");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50000), 200000);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  try {
    const tablesRes = await sql.unsafe(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`
    );
    const allTables = tablesRes.map((r: any) => r.table_name as string);

    if (listOnly) {
      const counts: Record<string, number> = {};
      for (const t of allTables) {
        const c = await sql.unsafe(`SELECT count(*)::int AS c FROM public."${t}"`);
        counts[t] = c[0].c;
      }
      await sql.end();
      return json({ tables: allTables, counts });
    }

    const targets = only ? only.split(",").map((s) => s.trim()).filter((t) => allTables.includes(t)) : allTables;
    if (targets.length === 0) return json({ error: "no valid table" }, 400);

    const out: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const t of targets) {
      const rows = await sql.unsafe(
        `SELECT * FROM public."${t}" LIMIT ${limit} OFFSET ${offset}`
      );
      out[t] = rows;
      counts[t] = rows.length;
    }

    await sql.end();
    return json({
      meta: {
        exported_at: new Date().toISOString(),
        source_project: "iwmrtxdzlkasuzutxvhh",
        limit,
        offset,
      },
      counts,
      data: out,
    });
  } catch (err) {
    await sql.end();
    return json({ error: (err as Error).message }, 500);
  }
});
