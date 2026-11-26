#!/bin/sh
set -eu
secret_file=/run/secrets/turn_shared_secret
if [ ! -r "$secret_file" ]; then
  echo "TURN secret file is not mounted at /run/secrets/turn_shared_secret" >&2
  exit 1
fi
secret="$(tr -d '\r\n' < "$secret_file")"
case "$secret" in
  ''|*[!A-Za-z0-9+/=_-]*)
    echo "TURN secret must be base64-compatible text" >&2
    exit 1
    ;;
esac
if [ "${#secret}" -lt 32 ]; then
  echo "TURN secret must contain at least 32 characters" >&2
  exit 1
fi
umask 077
{
  cat /etc/coturn/turnserver.conf
  printf '\nstatic-auth-secret=%s\n' "$secret"
} > /run/coturn/turnserver.conf
unset secret
exec turnserver "$@"
