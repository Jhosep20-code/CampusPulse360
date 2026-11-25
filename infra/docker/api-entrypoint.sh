#!/bin/sh
# Genera .dev.vars a partir de variables de entorno (nunca se versionan), aplica
# migraciones D1 locales y arranca el Worker en modo local.
set -eu
: "${GATEWAY_KEYS:?Falta GATEWAY_KEYS (ver infra/local.env.example)}"
: "${BOOTSTRAP_TOKEN:?Falta BOOTSTRAP_TOKEN (ver infra/local.env.example)}"
umask 077
{
  printf 'GATEWAY_KEYS=%s\n' "$GATEWAY_KEYS"
  printf 'BOOTSTRAP_TOKEN=%s\n' "$BOOTSTRAP_TOKEN"
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && printf 'TELEGRAM_BOT_TOKEN=%s\n' "$TELEGRAM_BOT_TOKEN"
  [ -n "${TELEGRAM_CHAT_ID:-}" ] && printf 'TELEGRAM_CHAT_ID=%s\n' "$TELEGRAM_CHAT_ID"
  true
} > .dev.vars
./node_modules/.bin/wrangler d1 migrations apply campuspulse-db --local
exec ./node_modules/.bin/wrangler dev --local --ip 0.0.0.0 --port 8787 \
  --var ENVIRONMENT:local \
  --var WEBAUTHN_RP_ID:localhost \
  --var WEBAUTHN_ORIGIN:http://localhost:8787 \
  --test-scheduled
