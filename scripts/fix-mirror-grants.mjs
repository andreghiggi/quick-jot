#!/usr/bin/env node
/**
 * Corrige GRANTs no espelho externo — sem isso login funciona mas
 * profiles/company_users/user_roles retornam vazio (permission denied).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvBackup() {
  const envPath = path.join(root, ".env.backup");
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
const TARGET_DB_URL = process.env.TARGET_DB_URL;
if (!TARGET_DB_URL) {
  console.error("❌ TARGET_DB_URL ausente em .env.backup");
  process.exit(1);
}

const sql = postgres(TARGET_DB_URL, { max: 1, prepare: false, connect_timeout: 30 });

const FIX_SQL = `
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
`;

try {
  console.log("🔧 Aplicando GRANTs para anon/authenticated no espelho...");
  await sql.unsafe(FIX_SQL);

  const rows = await sql`
    select c.relname, c.relacl::text as acl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('company_users','profiles','user_roles','companies')
    order by c.relname
  `;

  console.log("\n✅ ACLs após fix:");
  for (const r of rows) console.log(`  ${r.relname}: ${r.acl}`);

  console.log("\n✅ Pronto. Faça logout/login no localhost e teste de novo.");
} catch (e) {
  console.error("❌ Erro:", e.message ?? e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
