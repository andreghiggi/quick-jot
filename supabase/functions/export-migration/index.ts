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
  const only = url.searchParams.get("table");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50000), 200000);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const listOnly = url.searchParams.get("list") === "1";

  const sql = postgres(dbUrl, { max: 5, prepare: false });

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
