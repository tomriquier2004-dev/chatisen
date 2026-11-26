#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}; copy .env.example and configure the VM addresses." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
: "${TURN_REALM:?TURN_REALM is required}"
: "${TURN_EXTERNAL_IP:?TURN_EXTERNAL_IP is required}"
: "${TURN_INTERNAL_IP:?TURN_INTERNAL_IP is required}"
: "${TURN_METRICS_BIND_IP:=127.0.0.1}"
TURN_SECRET_FILE="${TURN_SECRET_FILE:-.turn_shared_secret}"
if [[ "${TURN_INTERNAL_IP}" != "172.30.0.10" ]]; then
  echo "TURN_INTERNAL_IP must match the fixed coturn container address 172.30.0.10." >&2
  exit 1
fi
if [[ "${TURN_SECRET_FILE}" = /* ]]; then
  SECRET_PATH="${TURN_SECRET_FILE}"
else
  SECRET_PATH="${ROOT}/${TURN_SECRET_FILE}"
fi
if [[ ! -f "${SECRET_PATH}" ]]; then
  echo "Missing TURN secret file: ${SECRET_PATH}" >&2
  exit 1
fi
TURN_SECRET="$(tr -d '\r\n' < "${SECRET_PATH}")"
if [[ ! "${TURN_SECRET}" =~ ^[A-Za-z0-9+/=_-]{32,}$ ]]; then
  unset TURN_SECRET
  echo "TURN secret must be at least 32 base64-compatible characters." >&2
  exit 1
fi
unset TURN_SECRET
docker network inspect chatisen-observability >/dev/null 2>&1 || docker network create chatisen-observability >/dev/null
docker compose --project-directory "${ROOT}" --env-file "${ENV_FILE}" -f "${ROOT}/compose.yml" up -d
for attempt in $(seq 1 20); do
  if curl --fail --silent "http://${TURN_METRICS_BIND_IP}:9641/metrics" >/dev/null; then
    echo "coturn Prometheus endpoint is responding on ${TURN_METRICS_BIND_IP}:9641/metrics"
    exit 0
  fi
  sleep 2
done
docker compose --project-directory "${ROOT}" --env-file "${ENV_FILE}" -f "${ROOT}/compose.yml" logs --tail=100 coturn
echo "coturn did not become healthy; inspect the logs above." >&2
exit 1
