#!/usr/bin/env node
/**
 * Workflow Audit 2026-09-21 00:00
 * Execução: SOMENTE LEITURA E PREPARAÇÃO
 */
import { execSync } from 'child_process';
import fs from 'fs';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = `/tmp/audit-${timestamp}.log`;
const logger = (msg) => {
  const entry = `[${new Date().toISOString()}] ${msg}`;
  console.log(entry);
  fs.appendFileSync(logFile, entry + '\n');
};

logger('INICIANDO WORKFLOW DE AUDITORIA 2026-09-21');

const run = (label, cmd) => {
  logger(`--- ${label} ---`);
  try {
    const out = execSync(cmd, { stdio: 'pipe' }).toString();
    logger(out);
  } catch (e) {
    logger(`ERRO em ${label}: ${e.stderr?.toString() || e.message}`);
  }
};

// 1. Diagnósticos de Produção
run('SYSTEM_HEALTH', 'uptime && df -h /');
run('DOCKER_STATUS', 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"');
run('BUNDLE_VALIDATION', 'node scripts/validate-prod-bundle.mjs');

// 2. Data Drift (Read-only Compare)
// Requer env vars setadas se rodar fora do ambiente com .env
run('DATA_DRIFT_REPORT', 'node scripts/rollback-compare-api.mjs');

// 3. Backup Status
run('BACKUP_FILES', 'ls -lh /var/backups/comandatech-pg/ | tail -n 5');

// 4. Staging Prep
logger('PREPARANDO BUNDLE DE STAGING...');
run('EXPORT_LOGIN_BUNDLE', 'node scripts/export-login-bundle.mjs');

logger(`AUDITORIA CONCLUÍDA. Relatório salvo em: ${logFile}`);
logger('AVISO: Nenhuma alteração foi feita no banco de dados, DNS ou serviços fiscais.');
