#!/usr/bin/env node
/**
 * Validação operacional pós-migração para lojas prioritárias:
 * Ruiva, Bon Appetit, I9 — print settings, NFC-e duplicatas, órfãs.
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/vps-test-stores.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://api.comandatech.com.br';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TARGET_SUBDOMAINS = ['cozinhadaruiva', 'bonappetit', 'lancheriada9', 'i9'];

if (!SERVICE_KEY) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: companies } = await sb
  .from('companies')
  .select('id, name, subdomain')
  .eq('active', true);

const targets = (companies || []).filter((c) =>
  TARGET_SUBDOMAINS.some((s) => (c.subdomain || '').toLowerCase().includes(s)),
);

if (!targets.length) {
  console.error('Nenhuma loja alvo encontrada. Subdomínios:', TARGET_SUBDOMAINS.join(', '));
  process.exit(1);
}

let failures = 0;

for (const c of targets) {
  console.log(`\n=== ${c.name} (${c.subdomain}) ===`);

  const { data: settings } = await sb
    .from('store_settings')
    .select('key, value')
    .eq('company_id', c.id)
    .in('key', ['print_layout', 'printer_paper_size']);

  const layout = settings?.find((s) => s.key === 'print_layout')?.value || 'v1';
  const paper = settings?.find((s) => s.key === 'printer_paper_size')?.value || '80mm';
  console.log(`  print_layout=${layout} printer_paper_size=${paper}`);

  if (!['v1', 'v2', 'v3'].includes(layout)) {
    console.error('  FAIL: print_layout inválido');
    failures++;
  }

  const { data: records } = await sb
    .from('nfce_records')
    .select('sale_id, external_id, status')
    .eq('company_id', c.id)
    .not('sale_id', 'is', null)
    .in('status', ['autorizada', 'processando', 'pendente']);

  const bySale = new Map();
  for (const r of records || []) {
    const list = bySale.get(r.sale_id) || [];
    list.push(r);
    bySale.set(r.sale_id, list);
  }
  const multiPrefix = [...bySale.entries()].filter(([, rows]) => rows.length > 1);
  if (multiPrefix.length) {
    console.error(`  FAIL: ${multiPrefix.length} sale_id(s) com múltiplas NFC-e ativas`);
    for (const [sid, rows] of multiPrefix.slice(0, 3)) {
      console.error(`    sale=${sid} → ${rows.map((x) => x.external_id).join(', ')}`);
    }
    failures += multiPrefix.length;
  } else {
    console.log('  OK: nenhuma venda com NFC-e duplicada (status ativo)');
  }

  const { count: orphanCount } = await sb
    .from('nfce_records')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', c.id)
    .eq('status', 'processando')
    .is('nfce_id', null);

  if (orphanCount > 0) {
    console.warn(`  WARN: ${orphanCount} NFC-e processando sem nfce_id`);
  } else {
    console.log('  OK: 0 órfãs processando sem nfce_id');
  }
}

console.log(failures ? `\n${failures} falha(s)` : '\nTodos os checks passaram.');
process.exit(failures ? 1 : 0);
