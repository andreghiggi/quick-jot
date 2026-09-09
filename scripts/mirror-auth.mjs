#!/usr/bin/env node
/**
 * Espelha auth.users + auth.identities da Lovable → Supabase externo.
 * SOMENTE LEITURA na origem. Escrita apenas no destino.
 *
 * Uso (a partir da raiz do projeto):
 *   1. Copie .env.backup.example → .env.backup e preencha as URLs postgres
 *   2. npm run mirror-auth
 *
 * Não faz deploy nem altera edge functions em produção.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvBackup() {
  const envPath = path.join(root, ".env.backup");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvBackup();

const SOURCE_DB_URL = process.env.SOURCE_DB_URL;
const TARGET_DB_URL = process.env.TARGET_DB_URL;

if (!SOURCE_DB_URL || !TARGET_DB_URL) {
  console.error("❌ Defina SOURCE_DB_URL e TARGET_DB_URL em .env.backup (veja .env.backup.example)");
  process.exit(1);
}

const AUTH_INSERT_ORDER = ["users", "identities"];
const AUTH_DELETE_ORDER = ["identities", "users"];
const BATCH_SIZE = 500;

async function commonColumns(source, target, table) {
  const src = await source`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  const tgt = await target`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = ${table}
  `;
  const tgtSet = new Set(tgt.map((r) => r.column_name));
  return src.map((r) => r.column_name).filter((c) => tgtSet.has(c));
}

async function pkColumns(source, table) {
  const rows = await source`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'auth' AND tc.table_name = ${table} AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `;
  return rows.map((r) => r.column_name);
}

async function mirrorTable(source, target, table) {
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

    const placeholders = [];
    const flatValues = [];
    let p = 1;
    for (const row of batch) {
      const ph = [];
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
    process.stdout.write(`  auth.${table}: ${total} linhas...\r`);
    if (batch.length < BATCH_SIZE) break;
  }
  console.log(`  auth.${table}: ${total} linhas copiadas`);
  return total;
}

async function main() {
  console.log("==> Espelhamento auth Lovable → externo");
  console.log("    Origem:  leitura apenas");
  console.log("    Destino: escrita (auth.users + auth.identities)\n");

  const source = postgres(SOURCE_DB_URL, { max: 2, prepare: false, connect_timeout: 15 });
  const target = postgres(TARGET_DB_URL, { max: 2, prepare: false, connect_timeout: 15 });

  try {
    await source`SELECT 1`;
    await target`SELECT 1`;
    console.log("✓ Conexões OK\n");

    await target`SET session_replication_role = 'replica'`;

    console.log("==> Limpando auth no destino...");
    for (const table of AUTH_DELETE_ORDER) {
      await target.unsafe(`DELETE FROM auth."${table}"`);
    }

    console.log("==> Copiando auth da origem...");
    let grandTotal = 0;
    for (const table of AUTH_INSERT_ORDER) {
      grandTotal += await mirrorTable(source, target, table);
    }

    await target`SET session_replication_role = 'origin'`;

    console.log(`\n✅ Concluído — ${grandTotal} linhas auth espelhadas`);
    console.log("   Reinicie npm run dev e teste login em http://localhost:8080/auth");
  } catch (e) {
    console.error("\n❌ Erro:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await source.end({ timeout: 5 });
    await target.end({ timeout: 5 });
  }
}

main();
