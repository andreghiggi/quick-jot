#!/usr/bin/env node
/**
 * Valida que o bundle em app.comandatech.com.br aponta para VPS, não Lovable.
 *
 * Uso: node scripts/validate-prod-bundle.mjs
 */
const APP_URL = process.env.APP_URL || 'https://app.comandatech.com.br';

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
const vpsCount = (js.match(/api\.comandatech\.com\.br/g) || []).length;
const lovableEndpoint = /https:\/\/iwmrtxdzlkasuzutxvhh|iwmrtxdzlkasuzutxvhh\.supabase\.co/.test(js);

console.log(`Bundle: ${jsMatch[1]}`);
console.log(`  api.comandatech.com.br: ${vpsCount}`);
console.log(`  lovable endpoint: ${lovableEndpoint}`);

if (lovableEndpoint) {
  console.error('FAIL: bundle ainda aponta para Lovable Cloud');
  process.exit(1);
}
if (vpsCount === 0) {
  console.error('FAIL: bundle não contém URL VPS');
  process.exit(1);
}
const urlIdx = js.indexOf('api.comandatech.com.br');
const urlSlice = js.slice(urlIdx, urlIdx + 250);
if (/=\s*""/.test(urlSlice) && !/eyJhbG/.test(urlSlice)) {
  console.error('FAIL: anon key VAZIA no bundle de produção');
  process.exit(1);
}
if (!/eyJhbG/.test(urlSlice)) {
  console.error('FAIL: anon key JWT ausente no bundle');
  process.exit(1);
}

const authRes = await fetch('https://api.comandatech.com.br/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: {
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4ODgzMDk1OSwiZXhwIjoyMTA0MTkwOTU5LCJyb2xlIjoiYW5vbiJ9.d7XOE2KQm-SIDaaYEGrKDNBq8mzixU9I3EHyVGRq-_k',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: 'invalid@test.com', password: 'wrong' }),
});
if (authRes.status !== 400 && authRes.status !== 401) {
  console.error(`FAIL: auth API HTTP ${authRes.status} (esperado 400/401)`);
  process.exit(1);
}
console.log(`  auth API: HTTP ${authRes.status} (OK)`);
console.log('PASS: produção aponta para VPS');
