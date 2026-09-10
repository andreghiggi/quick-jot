#!/usr/bin/env node
/**
 * Sync VPS → Lovable via Supabase REST (VPS service role + Lovable anon upsert).
 */
import { createClient } from '@supabase/supabase-js';

const VPS_URL = process.env.VPS_URL || 'https://api.comandatech.com.br';
const VPS_KEY = process.env.VPS_SERVICE_KEY;
const LOVABLE_URL = process.env.LOVABLE_URL || 'https://iwmrtxdzlkasuzutxvhh.supabase.co';
const LOVABLE_KEY = process.env.LOVABLE_ANON_KEY || process.env.LOVABLE_SERVICE_KEY;
const BATCH = 200;

const TABLES = [
  'companies', 'profiles', 'user_roles', 'company_users', 'company_modules', 'company_plans',
  'resellers', 'reseller_settings', 'reseller_companies', 'store_settings', 'payment_methods',
  'categories', 'products', 'optional_groups', 'optionals', 'optional_group_categories',
  'optional_group_products', 'orders', 'order_items', 'nfce_records', 'pdv_sales',
  'pdv_sale_items', 'pdv_sale_payments', 'cash_registers', 'cash_movements',
  'customers', 'customer_addresses', 'pinpad_settings', 'print_settings',
];

if (!VPS_KEY || !LOVABLE_KEY) {
  console.error('Defina VPS_SERVICE_KEY e LOVABLE_ANON_KEY');
  process.exit(1);
}

const src = createClient(VPS_URL, VPS_KEY, { auth: { persistSession: false } });
const tgt = createClient(LOVABLE_URL, LOVABLE_KEY, { auth: { persistSession: false } });

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

async function upsertTable(table, rows) {
  if (!rows.length) return 0;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await tgt.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
    done += chunk.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}   `);
  }
  console.log('');
  return done;
}

console.log('==> Sync VPS → Lovable (REST upsert)\n');
let total = 0;
for (const table of TABLES) {
  process.stdout.write(`  ${table}: lendo...`);
  const rows = await fetchAll(table);
  process.stdout.write(` ${rows.length} linhas\n`);
  if (rows.length) total += await upsertTable(table, rows);
}
console.log(`\n✅ ${total} linhas sincronizadas`);
