#!/usr/bin/env node
/**
 * Sincroniza VPS → Supabase Cloud (rollback) com UPSERT.
 * VPS é fonte da verdade para dados operacionais.
 *
 * Uso:
 *   SOURCE_DB_URL=postgresql://postgres:...@172.18.0.2:5432/postgres
 *   TARGET_DB_URL=postgresql://postgres.vyotbtmnnosiejyltlxc:...@pooler:6543/postgres
 *   node scripts/rollback-sync-vps-to-cloud.mjs [--tables orders,order_items] [--dry-run]
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const BATCH_SIZE = 500;

const SKIP_TABLES = new Set([
  'backup_runs',
  'tef_webservice_logs',
  'pinpdv_logs',
  'whatsapp_auto_reply_locks',
]);

const PRIORITY_TABLES = [
  'companies',
  'profiles',
  'user_roles',
  'company_users',
  'resellers',
  'reseller_settings',
  'reseller_companies',
  'company_modules',
  'company_plans',
  'store_settings',
  'print_settings',
  'pinpad_settings',
  'payment_methods',
  'categories',
  'products',
  'optional_groups',
  'optionals',
  'optional_group_categories',
  'optional_group_products',
  'orders',
  'order_items',
  'order_payments',
  'sales',
  'sale_items',
  'tef_transactions',
  'nfce_records',
  'cash_register_sessions',
  'cash_movements',
  'whatsapp_messages',
];

function loadEnvBackup() {
  const envPath = path.join(root, '.env.backup');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
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

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tablesArg = args.find((a) => a.startsWith('--tables='))?.slice('--tables='.length);
const onlyTables = tablesArg ? tablesArg.split(',').map((s) => s.trim()) : null;

const SOURCE_DB_URL = process.env.SOURCE_DB_URL;
const TARGET_DB_URL = process.env.TARGET_DB_URL;

if (!SOURCE_DB_URL || !TARGET_DB_URL) {
  console.error('Defina SOURCE_DB_URL e TARGET_DB_URL');
  process.exit(1);
}

async function pkColumns(db, schema, table) {
  const rows = await db`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = ${schema} AND tc.table_name = ${table} AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `;
  return rows.map((r) => r.column_name);
}

async function commonColumns(source, target, schema, table) {
  const src = await source`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = ${schema} AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  const tgt = await target`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = ${schema} AND table_name = ${table}
  `;
  const tgtSet = new Set(tgt.map((r) => r.column_name));
  return src.map((r) => r.column_name).filter((c) => tgtSet.has(c));
}

async function upsertTable(source, target, schema, table) {
  const pkCols = await pkColumns(source, schema, table);
  if (!pkCols.length) {
    console.log(`  skip ${schema}.${table}: sem PK`);
    return 0;
  }
  const colNames = await commonColumns(source, target, schema, table);
  if (!colNames.length) {
    console.log(`  skip ${schema}.${table}: sem colunas em comum`);
    return 0;
  }

  const quotedCols = colNames.map((c) => `"${c}"`).join(',');
  const orderBy = pkCols.map((c) => `"${c}"`).join(',');
  const conflictCols = pkCols.map((c) => `"${c}"`).join(',');
  const updateCols = colNames
    .filter((c) => !pkCols.includes(c))
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  let offset = 0;
  let total = 0;

  while (true) {
    const batch = await source.unsafe(
      `SELECT ${quotedCols} FROM ${schema}."${table}" ORDER BY ${orderBy} LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
    );
    if (!batch.length) break;

    if (!dryRun) {
      const placeholders = [];
      const flatValues = [];
      let p = 1;
      for (const row of batch) {
        const ph = [];
        for (const c of colNames) {
          ph.push(`$${p++}`);
          flatValues.push(row[c]);
        }
        placeholders.push(`(${ph.join(',')})`);
      }
      const sql = updateCols
        ? `INSERT INTO ${schema}."${table}" (${quotedCols}) VALUES ${placeholders.join(',')} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`
        : `INSERT INTO ${schema}."${table}" (${quotedCols}) VALUES ${placeholders.join(',')} ON CONFLICT (${conflictCols}) DO NOTHING`;
      await target.unsafe(sql, flatValues);
    }

    total += batch.length;
    offset += BATCH_SIZE;
    process.stdout.write(`  ${schema}.${table}: ${total} linhas...\r`);
    if (batch.length < BATCH_SIZE) break;
  }
  console.log(`  ${schema}.${table}: ${total} linhas ${dryRun ? '(dry-run)' : 'sincronizadas'}`);
  return total;
}

async function listPublicTables(source) {
  const rows = await source`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return rows.map((r) => r.table_name);
}

const source = postgres(SOURCE_DB_URL, { max: 3, prepare: false, connect_timeout: 30 });
const target = postgres(TARGET_DB_URL, { max: 3, prepare: false, connect_timeout: 30 });

try {
  await source`SELECT 1`;
  await target`SELECT 1`;
  console.log(`==> Rollback sync VPS → Cloud${dryRun ? ' (DRY-RUN)' : ''}\n`);

  await target`SET session_replication_role = 'replica'`;

  console.log('==> Auth (users + identities)');
  for (const table of ['users', 'identities']) {
    await upsertTable(source, target, 'auth', table);
  }

  let tables = onlyTables;
  if (!tables) {
    const all = await listPublicTables(source);
    const prioritySet = new Set(PRIORITY_TABLES);
    tables = [
      ...PRIORITY_TABLES.filter((t) => all.includes(t)),
      ...all.filter((t) => !prioritySet.has(t) && !SKIP_TABLES.has(t)),
    ];
  }

  console.log('\n==> Public tables');
  let grandTotal = 0;
  for (const table of tables) {
    if (SKIP_TABLES.has(table)) continue;
    grandTotal += await upsertTable(source, target, 'public', table);
  }

  await target`SET session_replication_role = 'origin'`;

  console.log(`\n✅ Concluído — ${grandTotal} linhas public sincronizadas`);
} catch (e) {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
} finally {
  await source.end({ timeout: 5 });
  await target.end({ timeout: 5 });
}
