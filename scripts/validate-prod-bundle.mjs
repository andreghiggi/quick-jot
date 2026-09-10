#!/usr/bin/env node
/**
 * Valida que o bundle em app.comandatech.com.br aponta para Lovable Cloud.
 *
 * Uso: node scripts/validate-prod-bundle.mjs
 */
const APP_URL = process.env.APP_URL || 'https://app.comandatech.com.br';
const LOVABLE_ANON =
  process.env.LOVABLE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bXJ0eGR6bGthc3V6dXR4dmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3OTExODMsImV4cCI6MjA4MDM2NzE4M30.VsnT1zdVUwJdv8gBlg8CthBx_bccZp-LsOs2PRq1Uik';

const htmlRes = await fetch(APP_URL);
if (!htmlRes.ok) {
  console.error(`FAIL: ${APP_URL} HTTP ${htmlRes.status}`);
  process.exit(1);
}
const html = await htmlRes.text();
const jsMatch = html.match(/\/assets\/(index-[^"]+\.js)/);
if (!jsMatch) {
  console.error('FAIL: não encontrou index-*.js no HTML');
  process.exit(1);
}
const jsUrl = `${APP_URL}/assets/${jsMatch[1]}`;
const jsRes = await fetch(jsUrl);
if (!jsRes.ok) {
  console.error(`FAIL: ${jsUrl} HTTP ${jsRes.status}`);
  process.exit(1);
}
const js = await jsRes.text();
const lovableCount = (js.match(/iwmrtxdzlkasuzutxvhh\.supabase\.co/g) || []).length;
const vpsEndpoint = js.includes('api.comandatech.com.br');

console.log(`Bundle: ${jsMatch[1]}`);
console.log(`  lovable endpoint: ${lovableCount > 0}`);
console.log(`  vps api endpoint: ${vpsEndpoint}`);

if (vpsEndpoint) {
  console.error('FAIL: bundle ainda aponta para VPS API');
  process.exit(1);
}
if (lovableCount === 0) {
  console.error('FAIL: bundle não contém URL Lovable');
  process.exit(1);
}
const urlIdx = js.indexOf('iwmrtxdzlkasuzutxvhh.supabase.co');
const urlSlice = js.slice(urlIdx, urlIdx + 250);
if (/=\s*""/.test(urlSlice) && !/eyJhbG/.test(urlSlice)) {
  console.error('FAIL: anon key VAZIA no bundle de produção');
  process.exit(1);
}
if (!/eyJhbG/.test(urlSlice)) {
  console.error('FAIL: anon key JWT ausente no bundle');
  process.exit(1);
}

const authRes = await fetch('https://iwmrtxdzlkasuzutxvhh.supabase.co/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: {
    apikey: LOVABLE_ANON,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: 'invalid@test.com', password: 'wrong' }),
});
if (authRes.status !== 400 && authRes.status !== 401) {
  console.error(`FAIL: auth API HTTP ${authRes.status} (esperado 400/401)`);
  process.exit(1);
}
console.log(`  auth API Lovable: HTTP ${authRes.status} (OK)`);
console.log('PASS: produção aponta para Lovable Cloud');
