#!/usr/bin/env node
/**
 * Compara contagens VPS (origem) vs Supabase Cloud (destino) por company_id.
 *
 * Uso:
 *   SOURCE_DB_URL=postgresql://... TARGET_DB_URL=postgresql://... node scripts/rollback-compare-db.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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

const SOURCE_DB_URL = process.env.SOURCE_DB_URL;
const TARGET_DB_URL = process.env.TARGET_DB_URL;

if (!SOURCE_DB_URL || !TARGET_DB_URL) {
  console.error('Defina SOURCE_DB_URL e TARGET_DB_URL');
  process.exit(1);
}

const TABLES = [
  'orders',
  'order_items',
  'sales',
  'sale_items',
  'order_payments',
  'tef_transactions',
  'nfce_records',
  'payment_methods',
  'store_settings',
  'products',
  'categories',
];

const source = postgres(SOURCE_DB_URL, { max: 2, prepare: false, connect_timeout: 20 });
const target = postgres(TARGET_DB_URL, { max: 2, prepare: false, connect_timeout: 20 });

try {
  await source`SELECT 1`;
  await target`SELECT 1`;

  const companies = await source`
    SELECT id, name FROM public.companies WHERE active = true ORDER BY name
  `;

  console.log('=== Comparacao VPS (source) vs Cloud (target) ===\n');
  console.log(`Lojas ativas: ${companies?.length ?? 0}\n`);

  const globalSummary = {};
  for (const table of TABLES) {
    const src = await source.unsafe(`SELECT count(*)::int AS n FROM public."${table}"`);
    const tgt = await target.unsafe(`SELECT count(*)::int AS n FROM public."${table}"`);
    globalSummary[table] = { source: src[0].n, target: tgt[0].n, delta: src[0].n - tgt[0].n };
  }

  console.log('Tabela                  | VPS    | Cloud  | Delta');
  console.log('------------------------|--------|--------|------');
  for (const [table, row] of Object.entries(globalSummary)) {
    console.log(
      `${table.padEnd(23)} | ${String(row.source).padStart(6)} | ${String(row.target).padStart(6)} | ${String(row.delta).padStart(6)}`,
    );
  }

  const srcUsers = await source`SELECT count(*)::int AS n FROM auth.users`;
  const tgtUsers = await target`SELECT count(*)::int AS n FROM auth.users`;
  console.log(
    `${'auth.users'.padEnd(23)} | ${String(srcUsers[0].n).padStart(6)} | ${String(tgtUsers[0].n).padStart(6)} | ${String(srcUsers[0].n - tgtUsers[0].n).padStart(6)}`,
  );

  console.log('\n=== Por loja (orders) ===');
  for (const c of companies) {
    const src = await source`SELECT count(*)::int AS n FROM public.orders WHERE company_id = ${c.id}`;
    const tgt = await target`SELECT count(*)::int AS n FROM public.orders WHERE company_id = ${c.id}`;
    const delta = src[0].n - tgt[0].n;
    const flag = delta !== 0 ? ' <--' : '';
    console.log(`${c.name}: VPS=${src[0].n} Cloud=${tgt[0].n} delta=${delta}${flag}`);
  }
} catch (e) {
  console.error('Erro:', e.message);
  process.exit(1);
} finally {
  await source.end({ timeout: 5 });
  await target.end({ timeout: 5 });
}
