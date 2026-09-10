#!/usr/bin/env node
/**
 * Sync VPS → Lovable via export-migration POST (import UPSERT).
 * Requer export-migration deployada na Lovable com handler POST.
 */
import { createClient } from '@supabase/supabase-js';

const VPS_URL = process.env.VPS_URL || 'https://api.comandatech.com.br';
const VPS_KEY = process.env.VPS_SERVICE_KEY;
const LOVABLE_URL = process.env.LOVABLE_URL || 'https://iwmrtxdzlkasuzutxvhh.supabase.co';
const LOVABLE_ANON = process.env.LOVABLE_ANON_KEY;
const TOKEN = process.env.MIGRATION_TOKEN || 'comanda-mig-2026-vps';
const BATCH = 100;

const TABLES = [
  'companies', 'profiles', 'user_roles', 'company_users', 'company_modules', 'company_plans',
  'resellers', 'reseller_settings', 'reseller_companies', 'store_settings', 'payment_methods',
  'categories', 'products', 'optional_groups', 'optionals', 'optional_group_categories',
  'optional_group_products', 'orders', 'order_items', 'nfce_records', 'pdv_sales',
  'pdv_sale_items', 'pdv_sale_payments', 'cash_registers', 'cash_movements',
  'customers', 'customer_addresses', 'pinpad_settings', 'print_settings',
];

if (!VPS_KEY || !LOVABLE_ANON) {
  console.error('Defina VPS_SERVICE_KEY e LOVABLE_ANON_KEY');
  process.exit(1);
}

const src = createClient(VPS_URL, VPS_KEY, { auth: { persistSession: false } });

async function fetchAll(table) {
  const rows = [];
  let from = 0;
  const page = 500;
  while (true) {
    const { data, error } = await src.from(table).select('*').range(from, from + page - 1);
    if (error) throw new Error(`${table} read: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return rows;
}

async function pushRows(table, rows) {
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const res = await fetch(`${LOVABLE_URL}/functions/v1/export-migration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-migration-token': TOKEN,
      },
      body: JSON.stringify({ table, rows: chunk }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${table}: ${body.error || res.status}`);
    done += chunk.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}   `);
  }
  console.log('');
}

console.log('==> Sync VPS → Lovable (export-migration POST)\n');
for (const table of TABLES) {
  process.stdout.write(`  ${table}: lendo...`);
  const rows = await fetchAll(table);
  process.stdout.write(` ${rows.length} linhas\n`);
  if (rows.length) await pushRows(table, rows);
}
console.log('\n✅ Sync concluído');
