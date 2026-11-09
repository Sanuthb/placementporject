#!/usr/bin/env bash
# Brings up the isolated stack, applies every migration, and seeds one college with a TPO admin. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/../../.."
C="docker compose -f tests/e2e/stack/docker-compose.yml"
$C up -d db mail
until docker exec m2-e2e-db-1 pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done
sleep 5
# The Auth server logs in as supabase_auth_admin; the image does not set its password from POSTGRES_PASSWORD reliably.
for r in supabase_auth_admin supabase_storage_admin; do docker exec -e PGPASSWORD=postgres m2-e2e-db-1 psql -h localhost -U supabase_admin -d postgres -qc "alter user $r with password 'postgres'"; done
source tests/e2e/stack/env.sh; export ANON_KEY=$SUPABASE_ANON_KEY SERVICE_KEY=$SUPABASE_SERVICE_ROLE_KEY
$C up -d auth storage gateway
until curl -fs http://localhost:54321/auth/v1/health >/dev/null 2>&1; do sleep 2; done
source tests/e2e/stack/env.sh
npx prisma migrate deploy
node tests/e2e/stack/seed-local.mjs
