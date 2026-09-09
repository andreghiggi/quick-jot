#!/usr/bin/env node
/**
 * Imprime valores corretos para GitHub Actions secrets (copiar para Settings → Secrets).
 * Não commitar output — contém anon key.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
let url = 'https://api.comandatech.com.br';
let key = '';
let projectId = 'comandatech-vps';

try {
  const env = readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^VITE_SUPABASE_(URL|PUBLISHABLE_KEY|PROJECT_ID)=(.+?)\r?$/);
    if (!m) continue;
    const v = m[2].trim().replace(/\r$/, '');
    if (m[1] === 'URL') url = v;
    if (m[1] === 'PUBLISHABLE_KEY') key = v;
    if (m[1] === 'PROJECT_ID') projectId = v;
  }
} catch {
  console.warn('Aviso: .env não encontrado, usando defaults VPS');
}

console.log('GitHub → Settings → Secrets and variables → Actions:\n');
console.log(`VITE_SUPABASE_URL=${url}`);
console.log(`VITE_SUPABASE_PUBLISHABLE_KEY=${key || '(copiar ANON_KEY da VPS)'}`);
console.log(`VITE_SUPABASE_PROJECT_ID=${projectId}`);
if (url.includes('iwmrt') || url.includes('supabase.co')) {
  console.error('\nERRO: .env ainda aponta para Lovable — corrija antes de setar secrets');
  process.exit(1);
}
