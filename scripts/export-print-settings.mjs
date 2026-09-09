#!/usr/bin/env node
/**
 * Exporta print_layout / printer_paper_size de todas as lojas ativas no VPS.
 *
 * Uso:
 *   SUPABASE_URL=https://api.comandatech.com.br \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/export-print-settings.mjs [--out docs/print-settings-vps.json]
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://api.comandatech.com.br';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRINT_KEYS = [
  'print_layout',
  'printer_paper_size',
  'auto_print_production_ticket',
  'tef_auto_print_vias',
];

const outArg = process.argv.indexOf('--out');
const outPath = outArg >= 0
  ? resolve(process.argv[outArg + 1])
  : resolve('docs/print-settings-vps.json');

if (!SERVICE_KEY) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: companies, error: cErr } = await sb
  .from('companies')
  .select('id, name, subdomain, active')
  .eq('active', true)
  .order('name');

if (cErr) {
  console.error(cErr.message);
  process.exit(1);
}

const snapshot = {
  exported_at: new Date().toISOString(),
  supabase_url: SUPABASE_URL,
  stores: [],
};

for (const c of companies || []) {
  const { data: settings } = await sb
    .from('store_settings')
    .select('key, value')
    .eq('company_id', c.id)
    .in('key', PRINT_KEYS);

  const map = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));
  const row = {
    company_id: c.id,
    name: c.name,
    subdomain: c.subdomain,
    print_layout: map.print_layout ?? '(default v1)',
    printer_paper_size: map.printer_paper_size ?? '(default 80mm)',
    auto_print_production_ticket: map.auto_print_production_ticket ?? null,
    tef_auto_print_vias: map.tef_auto_print_vias ?? null,
  };
  snapshot.stores.push(row);
  console.log(
    `${row.name.padEnd(28)} layout=${row.print_layout} paper=${row.printer_paper_size}`,
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
console.log(`\nSnapshot salvo em ${outPath} (${snapshot.stores.length} lojas)`);
