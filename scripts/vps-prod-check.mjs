#!/usr/bin/env node
/**
 * Diagnóstico de produção (api.comandatech.com.br) sem expor chaves no shell.
 *
 * Uso:
 *   set SUPABASE_URL=https://api.comandatech.com.br
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   node scripts/vps-prod-check.mjs [company_id|subdomain|email]
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://api.comandatech.com.br';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const target = process.argv[2] || '55181771-8b10-4af1-afc3-472c090a49be';

if (!SERVICE_KEY) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    console.log(`OK  ${label} (${Date.now() - t0}ms)`);
    return result;
  } catch (e) {
    console.log(`ERR ${label} (${Date.now() - t0}ms):`, e.message || e);
    return null;
  }
}

let company = null;
if (target.includes('@')) {
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', target.toLowerCase())
    .maybeSingle();
  if (profileErr || !profile) {
    console.error('Usuário não encontrado em profiles:', target, profileErr?.message);
    process.exit(1);
  }
  const { data: authUser, error: authErr } = await sb.auth.admin.getUserById(profile.id);
  if (authErr) {
    console.error('auth.admin.getUserById:', authErr.message);
  } else {
    console.log('User:', authUser.user.email, authUser.user.id, 'last_sign_in:', authUser.user.last_sign_in_at);
  }
  const { data: cu } = await sb.from('company_users').select('company_id, is_owner').eq('user_id', profile.id);
  console.log('company_users:', cu);
  if (cu?.[0]?.company_id) {
    const { data } = await sb.from('companies').select('*').eq('id', cu[0].company_id).single();
    company = data;
  }
} else if (target.includes('-') && target.length > 30) {
  const { data } = await sb.from('companies').select('*').eq('id', target).maybeSingle();
  company = data;
} else {
  const { data } = await sb.from('companies').select('*').eq('subdomain', target).maybeSingle();
  company = data;
}

if (!company) {
  console.error('Empresa não encontrada para:', target);
  process.exit(1);
}

console.log('\n=== Empresa ===');
console.log(company.name, company.id, 'active=', company.active, 'license=', company.license_status);

const cid = company.id;

await timed('is_company_suspended', async () => {
  const { data, error } = await sb.rpc('is_company_suspended', { _company_id: cid });
  if (error) throw error;
  console.log('   suspended =', data);
  return data;
});

await timed('products count', async () => {
  const { count, error } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('company_id', cid);
  if (error) throw error;
  console.log('   products =', count);
});

await timed('orders count', async () => {
  const { count, error } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('company_id', cid);
  if (error) throw error;
  console.log('   orders =', count);
});

await timed('optional_groups', async () => {
  const { count, error } = await sb.from('optional_groups').select('id', { count: 'exact', head: true }).eq('company_id', cid);
  if (error) throw error;
  console.log('   optional_groups =', count);
});

await timed('reseller_invoices overdue', async () => {
  const { data, error } = await sb
    .from('reseller_invoices')
    .select('id, status, due_date')
    .eq('company_id', cid)
    .in('status', ['pending', 'overdue']);
  if (error) throw error;
  console.log('   open invoices =', data?.length ?? 0, data?.slice(0, 3));
});

await timed('nfce processando', async () => {
  const { count, error } = await sb
    .from('nfce_records')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', cid)
    .in('status', ['processando', 'pendente']);
  if (error) throw error;
  console.log('   nfce pending =', count);
});

await timed('print_queue pending', async () => {
  const { count, error } = await sb
    .from('print_queue')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', cid)
    .eq('status', 'pending');
  if (error) throw error;
  console.log('   print pending =', count);
});

console.log('\n=== Realtime health (HTTP) ===');
try {
  const anon = process.env.SUPABASE_ANON_KEY;
  if (anon) {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/realtime/v1/api/tenants/realtime-dev/health`, {
      headers: { Authorization: `Bearer ${anon}` },
    });
    console.log('realtime health:', res.status, res.statusText);
  } else {
    console.log('(defina SUPABASE_ANON_KEY para testar realtime)');
  }
} catch (e) {
  console.log('realtime health ERR:', e.message);
}
