#!/usr/bin/env node
/**
 * Valida dist/ antes de publicar — falha se anon key vazia ou URL Lovable.
 *
 * Uso: node scripts/validate-bundle.mjs [dist/assets/index-*.js]
 */
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

// URL Lovable como endpoint (não confundir com cleanup de localStorage no HTML)
if (/https:\/\/iwmrtxdzlkasuzutxvhh|iwmrtxdzlkasuzutxvhh\.supabase\.co/.test(js)) {
  errors.push('contém URL Lovable Cloud como endpoint Supabase');
}

if (!js.includes('api.comandatech.com.br')) {
  errors.push('não contém api.comandatech.com.br');
}

// Vários formatos minificados: XQ="eyJ...", vF="eyJ...", .trim(),vF=""
const afterUrl = js.match(/https:\/\/api\.comandatech\.com\.br[^"]*".{0,80}/);
if (!afterUrl) {
  errors.push('não encontrou bloco createClient com URL VPS');
} else if (/=\s*""/.test(afterUrl[0]) && !/eyJhbG/.test(afterUrl[0])) {
  errors.push('anon key VAZIA após URL VPS — app trava em Carregando');
} else if (!/eyJhbGciOiJIUzI1Ni/.test(afterUrl[0]) && !/eyJhbG/.test(js.slice(js.indexOf('api.comandatech.com.br'), js.indexOf('api.comandatech.com.br') + 250))) {
  errors.push('anon key JWT ausente após api.comandatech.com.br');
}

if (errors.length) {
  console.error('FAIL:', errors.join('; '));
  process.exit(1);
}

console.log('PASS: bundle OK para produção VPS');
