#!/usr/bin/env bash
# Re-clone COMPLETO do banco de origem (Comanda Tech / Lovable Cloud)
# para o banco espelho no Supabase externo (vyotbtmnnosiejyltlxc).
#
# Quando rodar:
# - Quando o cron `backup-mirror` começar a acumular erros de schema
#   (colunas/tabelas novas que não existem no espelho).
# - Após migrações grandes na origem.
#
# Como rodar (dentro do sandbox Lovable):
#   bash scripts/backup_resync.sh
#
# Pré-requisitos:
# - PG* env vars apontando para a origem (sandbox já vem assim).
# - pg_dump / pg_restore 17+ no PATH.
#
# Observação: as FKs para `auth.users` falham porque o sandbox não tem
# acesso ao schema `auth`. Isso é esperado — o espelho é só pra dados
# de `public`. Auth users são reconstruídas via signup quando necessário.

set -euo pipefail

TARGET="${BACKUP_TARGET_DB_URL:-postgresql://postgres.vyotbtmnnosiejyltlxc:K7m2y9u4%40123@aws-1-us-west-2.pooler.supabase.com:6543/postgres}"
DUMP_FILE="/tmp/source_full.dump"

echo "==> 1/5 Dump completo (schema + dados) da origem..."
pg_dump \
  --no-owner --no-privileges --no-publications --no-subscriptions \
  --schema=public \
  --format=custom \
  --file="$DUMP_FILE" \
  --no-comments
ls -lh "$DUMP_FILE"

echo "==> 2/5 Limpando schema public do destino..."
psql "$TARGET" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

echo "==> 3/5 Restore pre-data (tabelas e tipos, sem FK/índices)..."
pg_restore --no-owner --no-privileges --section=pre-data --dbname="$TARGET" "$DUMP_FILE" 2>&1 | tail -5 || true

echo "==> 4/5 Restore data (COPY de todas as tabelas)..."
pg_restore --no-owner --no-privileges --section=data --disable-triggers --dbname="$TARGET" "$DUMP_FILE" 2>&1 | tail -10 || true

echo "==> 5/5 Restore post-data (índices + FK; erros para auth.users são esperados)..."
pg_restore --no-owner --no-privileges --section=post-data --dbname="$TARGET" "$DUMP_FILE" 2>&1 | tail -20 || true

echo "==> Grants padrão Supabase..."
psql "$TARGET" -v ON_ERROR_STOP=1 <<SQL
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;
SQL

echo "==> Estatísticas finais:"
psql "$TARGET" -c "SELECT count(*) AS tabelas FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
psql "$TARGET" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC LIMIT 15;"

echo "✅ Resync concluído"