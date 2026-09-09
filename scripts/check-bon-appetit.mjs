#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://api.comandatech.com.br';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: companies, error: ce } = await sb
  .from('companies')
  .select('id,name,slug,subdomain,active,license_status,license_block_reason,suspended')
  .or('name.ilike.%bon%appetit%,subdomain.ilike.%bon%');

if (ce) {
  console.error(ce);
  process.exit(1);
}

console.log('=== COMPANIES ===');
console.log(JSON.stringify(companies, null, 2));

for (const co of companies || []) {
  console.log(`\n=== ${co.name} (${co.id}) ===`);

  const { data: mods } = await sb.from('company_modules').select('module_name,enabled').eq('company_id', co.id);
  console.log('MODULES:', mods);

  const { data: pdv } = await sb.from('pdv_settings').select('*').eq('company_id', co.id).maybeSingle();
  console.log('PDV_SETTINGS:', pdv);

  const { data: ss } = await sb
    .from('store_settings')
    .select('key,value')
    .eq('company_id', co.id)
    .in('key', ['print_layout', 'printer_paper_size', 'mercado_enabled', 'frente_caixa_enabled']);

  console.log('STORE_SETTINGS:', ss);

  const { data: cash } = await sb
    .from('cash_registers')
    .select('id,name,is_open,opened_at')
    .eq('company_id', co.id)
    .order('opened_at', { ascending: false })
    .limit(5);
  console.log('CASH_REGISTERS:', cash);

  const { data: pm } = await sb
    .from('payment_methods')
    .select('id,name,active,type')
    .eq('company_id', co.id)
    .eq('active', true)
    .limit(10);
  console.log('PAYMENT_METHODS (active):', pm?.length, pm?.slice(0, 5));

  const { data: sales } = await sb
    .from('sales')
    .select('id,created_at,status,total,payment_status')
    .eq('company_id', co.id)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('RECENT_SALES:', sales);

  const { data: orders } = await sb
    .from('orders')
    .select('id,created_at,status,total,payment_status')
    .eq('company_id', co.id)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('RECENT_ORDERS:', orders);

  const { data: suspended } = await sb.rpc('is_company_suspended', { _company_id: co.id });
  console.log('IS_SUSPENDED:', suspended);
}
