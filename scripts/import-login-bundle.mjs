#!/usr/bin/env node
/**
 * Importa login-bundle.json (exportado da Lovable) no Supabase externo.
 * Escrita SOMENTE no destino (.env.backup → TARGET_DB_URL).
 *
 * Uso:
 *   node scripts/import-login-bundle.mjs caminho/para/login-bundle.json
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

const bundlePath = process.argv[2];
const TARGET_DB_URL = process.env.TARGET_DB_URL;

if (!bundlePath) {
  console.error("❌ Uso: node scripts/import-login-bundle.mjs <login-bundle.json>");
  process.exit(1);
}
if (!TARGET_DB_URL) {
  console.error("❌ Defina TARGET_DB_URL em .env.backup");
  process.exit(1);
}

const bundle = JSON.parse(fs.readFileSync(path.resolve(bundlePath), "utf8"));

const PUBLIC_INSERT_ORDER = [
  "companies",
  "resellers",
  "profiles",
  "user_roles",
  "company_users",
  "reseller_settings",
  "reseller_companies",
  "company_modules",
  "company_plans",
  "store_settings",
];

const PUBLIC_DELETE_ORDER = [...PUBLIC_INSERT_ORDER].reverse();

const AUTH_INSERT_ORDER = ["users", "identities"];
const AUTH_DELETE_ORDER = ["identities", "users"];

async function pkColumns(sql, schema, table) {
  const rows = await sql`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = ${schema}
      AND tc.table_name = ${table}
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `;
  return rows.map((r) => r.column_name);
}

async function tableColumns(sql, schema, table) {
  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = ${schema}
      AND table_name = ${table}
      AND (is_generated = 'NEVER' OR is_generated IS NULL)
    ORDER BY ordinal_position
  `;
  return rows.map((r) => r.column_name);
}

async function upsertRows(sql, schema, table, rows) {
  if (!rows?.length) {
    console.log(`  ⏭  ${schema}.${table}: vazio`);
    return 0;
  }

  const dbCols = await tableColumns(sql, schema, table);
  const pkCols = await pkColumns(sql, schema, table);
  if (!pkCols.length) throw new Error(`sem PK: ${schema}.${table}`);

  const colNames = dbCols.filter((c) => rows.some((r) => Object.prototype.hasOwnProperty.call(r, c)));
  if (!colNames.length) throw new Error(`nenhuma coluna compatível: ${schema}.${table}`);

  const quotedCols = colNames.map((c) => `"${c}"`).join(",");
  const conflictCols = pkCols.map((c) => `"${c}"`).join(",");
  const updateCols = colNames
    .filter((c) => !pkCols.includes(c))
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");

  let total = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = [];
    const flatValues = [];
    let p = 1;
    for (const row of batch) {
      const ph = [];
      for (const c of colNames) {
        ph.push(`$${p++}`);
        flatValues.push(row[c] ?? null);
      }
      placeholders.push(`(${ph.join(",")})`);
    }
    const sqlText = updateCols
      ? `INSERT INTO ${schema}."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`
      : `INSERT INTO ${schema}."${table}" (${quotedCols}) VALUES ${placeholders.join(",")} ON CONFLICT (${conflictCols}) DO NOTHING`;
    await sql.unsafe(sqlText, flatValues);
    total += batch.length;
  }

  console.log(`  ✅ ${schema}.${table}: ${total} linhas`);
  return total;
}

async function replaceTable(sql, schema, table, rows) {
  await sql.unsafe(`DELETE FROM ${schema}."${table}"`);
  return upsertRows(sql, schema, table, rows);
}

const sql = postgres(TARGET_DB_URL, { max: 1, prepare: false, connect_timeout: 30 });

try {
  console.log("📦 Importando login bundle...");
  console.log("   origem:", bundle.meta?.source_project ?? "?");
  console.log("   exportado:", bundle.meta?.exported_at ?? "?");

  await sql`SET session_replication_role = 'replica'`;

  for (const table of AUTH_DELETE_ORDER) {
    await sql.unsafe(`DELETE FROM auth."${table}"`);
  }
  console.log("🔐 Auth...");
  for (const table of AUTH_INSERT_ORDER) {
    await upsertRows(sql, "auth", table, bundle.auth?.[table] ?? []);
  }

  console.log("🏢 Public (login)...");
  for (const table of PUBLIC_DELETE_ORDER) {
    const rows = bundle.public?.[table];
    if (!rows?.length) continue;
    await sql.unsafe(`DELETE FROM public."${table}"`);
  }
  for (const table of PUBLIC_INSERT_ORDER) {
    await upsertRows(sql, "public", table, bundle.public?.[table] ?? []);
  }

  await sql`SET session_replication_role = 'origin'`;

  console.log("🔑 GRANTs anon/authenticated...");
  await sql.unsafe(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
  `);

  const check = await sql`
    select
      (select count(*)::int from auth.users) as auth_users,
      (select count(*)::int from public.profiles) as profiles,
      (select count(*)::int from public.user_roles) as user_roles,
      (select count(*)::int from public.company_users) as company_users,
      (select count(*)::int from public.companies) as companies,
      (select count(*)::int from public.resellers) as resellers
  `;
  console.log("\n📊 Destino após import:", check[0]);

  if (bundle.counts) {
    console.log("\n📋 Esperado (bundle.counts):", bundle.counts);
  }

  console.log("\n✅ Import concluído. Teste: npm run dev → http://localhost:8080/auth");
} catch (e) {
  console.error("❌ Erro:", e.message ?? e);
  process.exitCode = 1;
} finally {
  try {
    await sql`SET session_replication_role = 'origin'`;
  } catch (_) { /* ignore */ }
  await sql.end();
}
