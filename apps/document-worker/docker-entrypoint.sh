#!/usr/bin/env bash
# Starts the virus scanner, waits for it to be ready, then hands over to the worker as an
# unprivileged user. The worker refuses to process anything while clamd is not answering, so
# starting it first is what keeps the gate honest on a cold task.
set -euo pipefail

log() { printf '{"at":"%s","event":"entrypoint.%s","detail":"%s"}\n' "$(date -Iseconds)" "$1" "${2:-}"; }

if [ "${REQUIRE_VIRUS_SCAN:-true}" != "false" ]; then
  mkdir -p /run/clamav
  chown clamav:clamav /run/clamav
  log "clamd.starting"
  clamd &

  # clamd loads its signature database before it accepts connections; on Fargate that is
  # tens of seconds on a cold task, which is why the healthcheck has a start period.
  for _ in $(seq 1 90); do
    if node -e "require('net').connect(${CLAMD_PORT:-3310},'${CLAMD_HOST:-127.0.0.1}').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" 2>/dev/null; then
      log "clamd.ready"
      break
    fi
    sleep 2
  done

  # Refresh definitions in the background; the image already carries a usable database.
  (freshclam --quiet --daemon --checks=4 >/dev/null 2>&1 || true) &
else
  log "clamd.skipped" "REQUIRE_VIRUS_SCAN=false"
fi

log "worker.starting"
exec setpriv --reuid=worker --regid=worker --init-groups "$@"
