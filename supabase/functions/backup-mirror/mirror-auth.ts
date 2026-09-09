import type postgres from "npm:postgres@3.4.4";

const AUTH_INSERT_ORDER = ["users", "identities"] as const;
const AUTH_DELETE_ORDER = ["identities", "users"] as const;
const BATCH_SIZE = 500;

type Sql = ReturnType<typeof postgres>;

async function commonColumns(source: Sql, target: Sql, table: string): Promise<string[]> {
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

async function mirrorTable(source: Sql, target: Sql, table: string): Promise<number> {
  const colNames = await commonColumns(source, target, table);
  if (!colNames.length) throw new Error(`sem colunas em comum: auth.${table}`);

  const pkCols = await pkColumns(source, table);
  if (!pkCols.length) throw new Error(`sem PK: auth.${table}`);

  const quotedCols = colNames.map((c) => `"${c}"`).join(",");
  const orderBy = pkCols.map((c) => `"${c}"`).join(",");
  let offset = 0;
  let total = 0;

  while (true) {
    const batch = await source.unsafe(
      `SELECT ${quotedCols} FROM auth."${table}" ORDER BY ${orderBy} LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
    );
    if (!batch.length) break;

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
    const sql = updateCols
      ? `INSERT INTO auth."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`
      : `INSERT INTO auth."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO NOTHING`;

    await target.unsafe(sql, flatValues);
    total += batch.length;
    offset += BATCH_SIZE;
    if (batch.length < BATCH_SIZE) break;
  }

  return total;
}

export async function mirrorAuth(
  source: Sql,
  target: Sql,
  notify: (text: string) => Promise<void>,
) {
  const results = {
    users: 0,
    identities: 0,
    errors: [] as string[],
  };

  try {
    await target`SET session_replication_role = 'replica'`;

    for (const table of AUTH_DELETE_ORDER) {
      await target.unsafe(`DELETE FROM auth."${table}"`);
    }

    results.users = await mirrorTable(source, target, "users");
    results.identities = await mirrorTable(source, target, "identities");

    await target`SET session_replication_role = 'origin'`;

    const nowBrt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const text =
      `🔐 *Backup Auth Concluído*\n` +
      `Data: ${nowBrt}\n` +
      `Usuários: ${results.users}\n` +
      `Identidades: ${results.identities}`;
    await notify(text);
  } catch (e) {
    results.errors.push(e instanceof Error ? e.message : String(e));
    try {
      await target`SET session_replication_role = 'origin'`;
    } catch (_) { /* ignore */ }
  }

  return results;
}
