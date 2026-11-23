#!/usr/bin/env bash
# Planification : une sauvegarde au démarrage, puis toutes les BACKUP_INTERVAL_SECONDS (6 h par défaut).
# Une boucle plutôt qu'un cron : pas de démon supplémentaire, logs JSON sur stdout, arrêt propre.
set -uo pipefail

interval="${BACKUP_INTERVAL_SECONDS:-21600}"
trap 'exit 0' TERM INT

until pg_isready --quiet; do
  echo '{"event":"backup_waiting","reason":"postgres not ready"}'
  sleep 5
done

while true; do
  if ! /usr/local/bin/backup.sh; then
    echo '{"event":"backup_failed"}' >&2
  fi
  sleep "$interval" &
  wait $!
done
