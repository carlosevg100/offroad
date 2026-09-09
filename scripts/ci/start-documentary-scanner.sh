#!/usr/bin/env bash
set -euo pipefail

# Disposable GitHub Ubuntu runners only. Keep the packaged AppArmor profile enforced.
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
marker="$RUNNER_TEMP/documentary-scanner.pid"
pid_file=/run/clamav/clamd.pid
if [[ "${1:-start}" == stop ]]; then
  if [[ -f "$marker" ]] && sudo test -f "$pid_file"; then
    owned_pid=$(cat "$marker")
    current_pid=$(sudo cat "$pid_file")
    if [[ "$owned_pid" =~ ^[0-9]+$ ]] && [[ "$owned_pid" == "$current_pid" ]] &&
      [[ "$(sudo cat "/proc/$owned_pid/comm" 2>/dev/null || true)" == clamd ]]; then
      sudo kill "$owned_pid"
    fi
  fi
  rm -f "$marker"
  exit 0
fi
[[ "${1:-start}" == start ]] || { echo 'Expected start or stop' >&2; exit 2; }
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends clamav clamav-daemon
sudo systemctl stop clamav-freshclam clamav-daemon clamav-daemon.socket
# Never accept a definitions update failure or disable scanning to unblock the journey.
sudo timeout 180 freshclam --stdout
# These standard paths are permitted by Ubuntu's packaged usr.sbin.clamd profile.
printf '%s\n' 'TCPSocket 3310' 'TCPAddr 127.0.0.1' 'User clamav' \
  'DatabaseDirectory /var/lib/clamav' 'StreamMaxLength 128M' \
  'MaxFileSize 128M' 'MaxScanSize 512M' 'Foreground false' \
  'PidFile /run/clamav/clamd.pid' 'LogSyslog false' \
  | sudo tee /etc/clamav/clamd.conf >/dev/null
sudo install -d -o clamav -g clamav /run/clamav
sudo clamd --config-file=/etc/clamav/clamd.conf
for attempt in {1..30}; do
  sudo test -s "$pid_file" && break
  sleep 1
done
sudo cat "$pid_file" > "$marker"
timeout 90 node scripts/ci/documentary-scanner-preflight.mjs
