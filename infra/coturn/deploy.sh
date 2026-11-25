#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}; copy .env.example and set the VM addresses and TURN secret." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${TURN_REALM:?TURN_REALM is required}"
: "${TURN_SHARED_SECRET:?TURN_SHARED_SECRET is required}"
: "${TURN_EXTERNAL_IP:?TURN_EXTERNAL_IP is required}"
: "${TURN_INTERNAL_IP:?TURN_INTERNAL_IP is required}"
if (( ${#TURN_SHARED_SECRET} < 32 )); then
  echo "TURN_SHARED_SECRET must contain at least 32 characters." >&2
  exit 1
fi

docker network inspect chatisen-observability >/dev/null 2>&1 || docker network create chatisen-observability >/dev/null
docker compose --project-directory "${ROOT}" --env-file "${ENV_FILE}" -f "${ROOT}/compose.yml" up -d
for attempt in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:9641/metrics >/dev/null; then
    echo "coturn Prometheus endpoint is responding on 127.0.0.1:9641/metrics"
    exit 0
  fi
  sleep 2
done
docker compose --project-directory "${ROOT}" --env-file "${ENV_FILE}" -f "${ROOT}/compose.yml" logs --tail=100 coturn
echo "coturn did not become healthy; inspect the logs above." >&2
exit 1
