#!/usr/bin/env bash
# Puts the LLM keys where they belong, without them passing through a chat, a commit or the
# shell history. Values are read from a hidden prompt and written straight to their target.
#
#   ./scripts/set-secrets.sh local   → apps/web/.env.local + .env.local (gitignored)
#   ./scripts/set-secrets.sh aws     → AWS Secrets Manager in sa-east-1 (worker runtime)
#
# Never pass a key as an argument: arguments land in `history` and in `ps`.
set -euo pipefail

target="${1:-local}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

read_secret() {
  local label="$1" value=""
  printf '%s (input hidden, empty to skip): ' "$label" >&2
  read -rs value
  printf '\n' >&2
  printf '%s' "$value"
}

write_env() {
  local file="$1" name="$2" value="$3"
  [ -z "$value" ] && return 0
  touch "$file"
  chmod 600 "$file"
  # replace an existing line for this variable, or append one
  if grep -q "^${name}=" "$file" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    grep -v "^${name}=" "$file" > "$tmp"
    mv "$tmp" "$file"
    chmod 600 "$file"
  fi
  printf '%s=%s\n' "$name" "$value" >> "$file"
  printf '  %s written to %s\n' "$name" "$file" >&2
}

put_aws() {
  local name="$1" value="$2"
  [ -z "$value" ] && return 0
  if aws secretsmanager describe-secret --secret-id "$name" --region sa-east-1 >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --secret-id "$name" --region sa-east-1 \
      --secret-string "$value" --output text --query 'VersionId' >/dev/null
    printf '  %s rotated in Secrets Manager (sa-east-1)\n' "$name" >&2
  else
    aws secretsmanager create-secret --secret-id "$name" --region sa-east-1 \
      --description 'Offroad document worker — LLM provider key' \
      --secret-string "$value" --output text --query 'ARN'
  fi
}

anthropic="$(read_secret 'ANTHROPIC_API_KEY')"
openai="$(read_secret 'OPENAI_API_KEY')"

case "$target" in
  local)
    write_env "$root/.env.local" ANTHROPIC_API_KEY "$anthropic"
    write_env "$root/.env.local" OPENAI_API_KEY "$openai"
    ;;
  aws)
    put_aws offroad/anthropic-api-key "$anthropic"
    put_aws offroad/openai-api-key "$openai"
    ;;
  *)
    printf 'usage: %s [local|aws]\n' "$0" >&2
    exit 2
    ;;
esac

unset anthropic openai
printf 'done — nothing was written to the repository or to your shell history.\n' >&2
