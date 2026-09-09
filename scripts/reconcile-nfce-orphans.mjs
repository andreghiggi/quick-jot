#!/usr/bin/env node
/**
 * Reconcilia NFC-e órfãs (processando/pendente sem nfce_id) via nfce-contingencia-sync
 * e reconciliar_por_external_id no nfce-proxy.
 *
 * Uso (na VPS ou com SUPABASE_URL apontando para api.comandatech.com.br):
 *   node scripts/reconcile-nfce-orphans.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log('==> contingencia-sync');
  const sync = await fetch(`${SUPABASE_URL}/functions/v1/nfce-contingencia-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: '{}',
  });
  console.log(await sync.json());

  const { data: orphans, error } = await supabase
    .from('nfce_records')
    .select('id, company_id, external_id, status')
    .is('nfce_id', null)
    .not('external_id', 'is', null)
    .in('status', ['processando', 'pendente'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  console.log(`==> ${orphans?.length || 0} órfãs para reconciliar manualmente`);

  let ok = 0;
  let fail = 0;
  for (const row of orphans || []) {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/nfce-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        action: 'reconciliar_por_external_id',
        companyId: row.company_id,
        payload: { external_id: row.external_id },
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (resp.ok && json?.success !== false) {
      ok++;
      console.log('OK', row.external_id, json?.data?.status || json?.data?.numero || '');
    } else {
      fail++;
      console.warn('FAIL', row.external_id, json?.error || resp.status);
    }
  }
  console.log(`==> reconciliadas: ${ok}, falhas: ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
