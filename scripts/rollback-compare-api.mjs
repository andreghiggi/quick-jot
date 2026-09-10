#!/usr/bin/env node
/**
 * Compara contagens VPS vs Lovable via REST (service role).
 */
import { createClient } from '@supabase/supabase-js';

const VPS_URL = process.env.VPS_URL || 'https://api.comandatech.com.br';
const VPS_KEY =
  process.env.VPS_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4ODgzMDk1OSwiZXhwIjoyMTA0MTkwOTU5LCJyb2xlIjoic2VydmljZV9yb2xlIn0.QCSt9yneDrf8j1hO9Qe2SWo_SRwEt49TeYfpA-_3FsA';

const LOVABLE_URL = process.env.LOVABLE_URL || 'https://iwmrtxdzlkasuzutxvhh.supabase.co';
const LOVABLE_KEY =
  process.env.LOVABLE_SERVICE_KEY || process.env.LOVABLE_ANON_KEY || process.env.LOVABLE_KEY;

if (!LOVABLE_KEY) {
  console.error('Defina LOVABLE_SERVICE_KEY ou LOVABLE_ANON_KEY');
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
  'companies',
];

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function count(sb, table, filter) {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = q.match(filter);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

const vps = client(VPS_URL, VPS_KEY);
const lovable = client(LOVABLE_URL, LOVABLE_KEY);

console.log('=== Comparacao VPS vs Lovable (REST) ===\n');
console.log(`VPS:     ${VPS_URL}`);
console.log(`Lovable: ${LOVABLE_URL}\n`);

try {
  await vps.from('companies').select('id', { count: 'exact', head: true });
} catch (e) {
  console.error('VPS inacessivel:', e.message);
  process.exit(1);
}

try {
  await lovable.from('companies').select('id', { count: 'exact', head: true });
} catch (e) {
  console.error('Lovable inacessivel:', e.message);
  process.exit(1);
}

console.log('Tabela                  | VPS    | Lovable | Delta');
console.log('------------------------|--------|---------|------');

for (const table of TABLES) {
  const v = await count(vps, table);
  const l = await count(lovable, table);
  const delta = v - l;
  const flag = delta !== 0 ? '  <--' : '';
  console.log(
    `${table.padEnd(23)} | ${String(v).padStart(6)} | ${String(l).padStart(7)} | ${String(delta).padStart(5)}${flag}`,
  );
}

const { data: companies } = await vps
  .from('companies')
  .select('id, name')
  .eq('active', true)
  .order('name');

console.log('\n=== Pedidos por loja ===');
for (const c of companies || []) {
  const v = await count(vps, 'orders', { company_id: c.id });
  const l = await count(lovable, 'orders', { company_id: c.id });
  const delta = v - l;
  const flag = delta !== 0 ? '  <-- FALTA SYNC' : '';
  console.log(`${c.name}: VPS=${v} Lovable=${l} delta=${delta}${flag}`);
}
