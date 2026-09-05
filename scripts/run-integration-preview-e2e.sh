#!/usr/bin/env bash
# Runs the Case 01 integration_preview journey on a local stack, the way the CI e2e job does:
# local Supabase, the web app built against it, the worker deployed from a hoisted tree and
# started without model keys, then the Playwright spec with video and transcript.
#
#   scripts/run-integration-preview-e2e.sh
#
# Needs Docker (for `supabase start`), pnpm 10 and Node 24. Nothing here touches production.
set -euo pipefail
cd "$(dirname "$0")/.."

supabase start -x studio,imgproxy,edge-runtime,realtime,supavisor,postgres-meta >/dev/null
eval "$(supabase status -o env)"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
export NEXT_PUBLIC_SUPABASE_URL="${API_URL}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY}}"
export NEXT_PUBLIC_SITE_URL="http://127.0.0.1:3000"
export E2E_MAIL_URL="${MAILPIT_URL:-${INBUCKET_URL:-http://127.0.0.1:54324}}"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "alter table public.organizations alter column pipeline_enabled set default false;"
curl -sS -X POST "${API_URL}/auth/v1/signup" -H "apikey: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}" -H "Content-Type: application/json" \
  -d '{"email":"local-worker@offroad.invalid","password":"local-worker-password-2026"}' >/dev/null || true
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = 'local-worker@offroad.invalid';"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f apps/web/e2e/support/integration-preview-local.sql

pnpm --filter web build
pnpm --filter @offroad/document-worker... build
WORKER_DIR="${TMPDIR:-/tmp}/offroad-worker-e2e"
rm -rf "$WORKER_DIR"
pnpm deploy --legacy --filter @offroad/document-worker --prod --config.node-linker=hoisted "$WORKER_DIR"

(
  export SUPABASE_URL="${API_URL}" SUPABASE_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}"
  export WORKER_ACCOUNT_EMAIL="local-worker@offroad.invalid" WORKER_ACCOUNT_PASSWORD="local-worker-password-2026"
  export OFFROAD_WORKER_TOKEN="e2e-worker-token-e2e-worker-token-e2e-worker-token-e2e-worker-token-"
  export REQUIRE_VIRUS_SCAN=false IDLE_POLL_SECONDS=2 LOG_LEVEL=info
  exec node "$WORKER_DIR/dist/main.js"
) > worker.log 2>&1 &
WORKER_PID=$!
trap 'kill "$WORKER_PID" 2>/dev/null || true' EXIT
sleep 5
grep -q '"event":"worker.signed_in"' worker.log || { cat worker.log; echo "the worker did not sign in"; exit 1; }

pnpm --filter web exec playwright test e2e/integration-preview-case01.spec.ts
echo "video, screenshots and transcript: apps/web/test-results/integration-preview-case01/ and apps/web/test-results/"
