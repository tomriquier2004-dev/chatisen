#!/usr/bin/env bash
# Sauvegarde chiffrée de PostgreSQL : pg_dump (format custom) chiffré par age
# avec la clé PUBLIQUE de l'équipe. La clé privée n'est jamais sur le serveur.
# Variables : PGHOST, PGPORT, PGUSER, PGPASSWORD (ou PGPASSWORD_FILE), PGDATABASE,
#             BACKUP_AGE_RECIPIENT, BACKUP_DIR (/backups), BACKUP_RETENTION_DAYS (7).
set -euo pipefail

if [[ -n "${PGPASSWORD_FILE:-}" ]]; then
  PGPASSWORD="$(<"$PGPASSWORD_FILE")"
  export PGPASSWORD
fi

: "${BACKUP_AGE_RECIPIENT:?clé publique age requise (BACKUP_AGE_RECIPIENT)}"
: "${PGHOST:?PGHOST requis}" "${PGUSER:?PGUSER requis}" "${PGDATABASE:?PGDATABASE requis}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
name="${PGDATABASE}-${ts}.dump.age"
partial="${BACKUP_DIR}/.${name}.partial"
trap '[[ -f "$partial" ]] && unlink "$partial" || true' EXIT

start_ms=$(($(date +%s%N) / 1000000))

# pipefail : un échec de pg_dump fait échouer la sauvegarde, même si age réussit.
pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$partial"

# Écriture atomique : un fichier sans .partial est toujours complet.
mv "$partial" "${BACKUP_DIR}/${name}"
(cd "$BACKUP_DIR" && sha256sum "$name" >"${name}.sha256")

end_ms=$(($(date +%s%N) / 1000000))
size=$(stat -c %s "${BACKUP_DIR}/${name}")
date -u +%s >"${BACKUP_DIR}/last_success"

# Rétention : ne s'exécute qu'après une sauvegarde réussie, la plus récente est donc toujours gardée.
find "$BACKUP_DIR" -maxdepth 1 -type f -name "${PGDATABASE}-*.dump.age*" \
  -mtime +"$BACKUP_RETENTION_DAYS" -delete

printf '{"event":"backup_succeeded","file":"%s","bytes":%s,"duration_ms":%s}\n' \
  "$name" "$size" "$((end_ms - start_ms))"
