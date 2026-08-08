import type postgres from "npm:postgres@3.4.4";

export const AUTH_INSERT_ORDER = ["users", "identities"] as const;
export const AUTH_DELETE_ORDER = ["identities", "users"] as const;

type Sql = ReturnType<typeof postgres>;

export type MirrorAuthResult = {
  perTable: Record<string, { rows: number; ms: number; error?: string }>;
  totalRows: number;
  errorMessage: string | null;
  status: "success" | "partial" | "error";
};

async function commonColumns(
  source: Sql,
  target: Sql,
  table: string,
): Promise<string[]> {
  const src = await source`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  const tgt = await target`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = ${table}
  `;
  const tgtSet = new Set(tgt.map((r) => r.column_name as string));
  return src.map((r) => r.column_name as string).filter((c) => tgtSet.has(c));
}

async function pkColumns(source: Sql, table: string): Promise<string[]> {
  const rows = await source`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'auth'
      AND tc.table_name = ${table}
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `;
  return rows.map((r) => r.column_name as string);
}

export async function mirrorAuthTables(
  source: Sql,
  target: Sql,
  options: {
    batchSize?: number;
    maxRuntimeMs?: number;
    startedAt?: number;
    clearTarget?: boolean;
  } = {},
): Promise<MirrorAuthResult> {
  const batchSize = options.batchSize ?? 500;
  const maxRuntimeMs = options.maxRuntimeMs ?? 120_000;
  const startedAt = options.startedAt ?? Date.now();
  const clearTarget = options.clearTarget ?? true;

  const perTable: MirrorAuthResult["perTable"] = {};
  let totalRows = 0;
  let errorMessage: string | null = null;
  let status: MirrorAuthResult["status"] = "success";

  try {
    await target`SET session_replication_role = 'replica'`;
  } catch (_) { /* ignore */ }

  if (clearTarget) {
    for (const table of AUTH_DELETE_ORDER) {
      try {
        await target.unsafe(`DELETE FROM auth."${table}"`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errorMessage = (errorMessage ? errorMessage + "; " : "") + `delete auth.${table}: ${msg}`;
        status = "partial";
      }
    }
  }

  for (const table of AUTH_INSERT_ORDER) {
    const key = `auth.${table}`;
    const tStart = Date.now();
    let rowsForTable = 0;

    try {
      const colNames = await commonColumns(source, target, table);
      if (colNames.length === 0) {
        throw new Error("nenhuma coluna em comum entre origem e destino");
      }

      const pkCols = await pkColumns(source, table);
      if (pkCols.length === 0) {
        throw new Error("tabela sem primary key");
      }

      const quotedCols = colNames.map((c) => `"${c}"`).join(",");
      const orderBy = pkCols.map((c) => `"${c}"`).join(",");
      let offset = 0;

      while (true) {
        if (Date.now() - startedAt > maxRuntimeMs) {
          throw new Error("timeout durante espelhamento auth");
        }

        const batch = await source.unsafe(
          `SELECT ${quotedCols} FROM auth."${table}" ORDER BY ${orderBy} LIMIT ${batchSize} OFFSET ${offset}`,
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
        const updateCols = colNames
          .filter((c) => !pkCols.includes(c))
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(", ");
        const upsertSql = updateCols.length
          ? `INSERT INTO auth."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`
          : `INSERT INTO auth."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO NOTHING`;

        await target.unsafe(upsertSql, flatValues);
        rowsForTable += batch.length;
        offset += batchSize;
        if (batch.length < batchSize) break;
      }

      perTable[key] = { rows: rowsForTable, ms: Date.now() - tStart };
      totalRows += rowsForTable;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      perTable[key] = { rows: rowsForTable, ms: Date.now() - tStart, error: msg };
      errorMessage = (errorMessage ? errorMessage + "; " : "") + `${key}: ${msg}`;
      status = status === "success" ? "partial" : status;
    }
  }

  try {
    await target`SET session_replication_role = 'origin'`;
  } catch (_) { /* ignore */ }

  return { perTable, totalRows, errorMessage, status };
}
