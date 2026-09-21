#!/usr/bin/env node
/** Valida dist/ antes de publicar — URL VPS + anon key presente. */
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const distAssets = resolve('dist/assets');
let jsPath = process.argv[2];

if (!jsPath) {
  const files = readdirSync(distAssets).filter((f) => /^index-.*\.js$/.test(f));
  if (!files.length) {
    console.error('FAIL: nenhum index-*.js em dist/assets');
    process.exit(1);
  }
  jsPath = resolve(distAssets, files.sort().pop());
}

const js = readFileSync(jsPath, 'utf8');
const name = jsPath.split(/[/\\]/).pop();
console.log(`Validando ${name} (${(js.length / 1024 / 1024).toFixed(2)} MB)`);

const errors = [];

// O project id pode aparecer como identificador interno sem representar o
// endpoint usado pelo cliente. Bloqueie somente a URL antiga completa.
if (/https:\/\/iwmrtxdzlkasuzutxvhh\.supabase\.co/.test(js)) {
  errors.push('contém URL Lovable Cloud (indisponível) — use api.comandatech.com.br');
}

if (!/https:\/\/api\.comandatech\.com\.br/.test(js)) {
  errors.push('não contém api.comandatech.com.br');
}

const afterUrl = js.match(/https:\/\/api\.comandatech\.com\.br[^"]*".{0,80}/);
if (!afterUrl) {
  errors.push('não encontrou createClient com URL VPS');
} else if (/=\s*""/.test(afterUrl[0]) && !/eyJhbG/.test(afterUrl[0])) {
  errors.push('anon key VAZIA — app trava em Carregando');
} else if (
  !/eyJhbGciOiJIUzI1Ni/.test(afterUrl[0]) &&
  !/eyJhbG/.test(
    js.slice(js.indexOf('api.comandatech.com.br'), js.indexOf('api.comandatech.com.br') + 250),
  )
) {
  errors.push('anon key JWT ausente após URL VPS');
}

if (errors.length) {
  console.error('FAIL:', errors.join('; '));
  process.exit(1);
}

console.log('PASS: bundle OK para produção VPS');
