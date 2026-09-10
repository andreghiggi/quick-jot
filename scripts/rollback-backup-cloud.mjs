#!/usr/bin/env node
/**
 * Backup Supabase Cloud antes do rollback sync.
 * Requer pg_dump instalado no PATH.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvBackup() {
  const envPath = path.join(root, '.env.backup');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvBackup();

const TARGET_DB_URL = process.env.TARGET_DB_URL || process.env.LOVABLE_DB_URL;
if (!TARGET_DB_URL) {
  console.error('Defina TARGET_DB_URL ou LOVABLE_DB_URL em .env.backup');
  process.exit(1);
}

const outDir = path.join(root, 'backups');
fs.mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = path.join(outDir, `pre-rollback-cloud-${ts}.dump`);

console.log(`Backup cloud → ${outFile}`);
execSync(`pg_dump -Fc "${TARGET_DB_URL}" --schema=public --schema=auth -f "${outFile}"`, {
  stdio: 'inherit',
});
console.log('✅ Backup cloud concluído');
