#!/usr/bin/env node
/**
 * Audita todas as lojas ativas: vínculo auth, licença, NFC-e órfãs.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/vps-audit-companies.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://api.comandatech.com.br';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: companies, error } = await sb
  .from('companies')
  .select('id, name, subdomain, login_email, license_status, active')
  .eq('active', true)
  .order('name');

if (error) {
  console.error(error.message);
  process.exit(1);
}

const issues = [];

for (const c of companies || []) {
  const row = { company: c.name, id: c.id, problems: [] };

  if (c.license_status !== 'active') {
    row.problems.push(`license_status=${c.license_status}`);
  }

  const { data: owners } = await sb
    .from('company_users')
    .select('user_id, is_owner')
    .eq('company_id', c.id)
    .eq('is_owner', true);

  if (!owners?.length) {
    row.problems.push('sem owner em company_users');
  } else {
    for (const o of owners) {
      const { data: profile } = await sb.from('profiles').select('email').eq('id', o.user_id).maybeSingle();
      if (!profile) row.problems.push(`owner ${o.user_id} sem profile`);
      else {
        const { error: authErr } = await sb.auth.admin.getUserById(o.user_id);
        if (authErr) row.problems.push(`owner ${profile.email} auth: ${authErr.message}`);
      }
    }
  }

  const { count: orphanNfce } = await sb
    .from('nfce_records')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', c.id)
    .in('status', ['processando', 'pendente'])
    .is('nfce_id', null);

  if ((orphanNfce ?? 0) > 0) {
    row.problems.push(`nfce_orfas=${orphanNfce}`);
  }

  if (row.problems.length) issues.push(row);
}

console.log(`Lojas ativas: ${companies?.length ?? 0}`);
console.log(`Com problemas: ${issues.length}`);
for (const i of issues) {
  console.log(`- ${i.company} (${i.id}): ${i.problems.join('; ')}`);
}

process.exit(issues.length ? 1 : 0);
