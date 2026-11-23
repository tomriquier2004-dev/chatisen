#!/usr/bin/env bash
# Restauration d'une sauvegarde chiffrée dans la base désignée par PGHOST / PGDATABASE.
# Usage : restore.sh <fichier.dump.age> <fichier-identité-age>
# ATTENTION : --clean supprime les objets existants de la base cible avant de les recréer.
# Garde-fou (issue #44) : RESTORE_CONFIRM doit valoir le nom de la base cible (PGDATABASE),
# sinon le script refuse de tourner. Une variable mal positionnée ne suffit plus à écraser une base.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage : $0 <fichier.dump.age> <fichier-identité-age>" >&2
  exit 2
fi
file="$1"
identity="$2"

if [[ -n "${PGPASSWORD_FILE:-}" ]]; then
  PGPASSWORD="$(<"$PGPASSWORD_FILE")"
  export PGPASSWORD
fi
: "${PGHOST:?PGHOST requis}" "${PGUSER:?PGUSER requis}" "${PGDATABASE:?PGDATABASE requis}"

if [[ "${RESTORE_CONFIRM:-}" != "$PGDATABASE" ]]; then
  echo "Refus : cette restauration EFFACE la base « $PGDATABASE » sur « $PGHOST » avant de la recréer." >&2
  echo "Pour confirmer, relancer avec RESTORE_CONFIRM=$PGDATABASE" >&2
  exit 3
fi

# Intégrité : refuse un fichier tronqué ou altéré.
if [[ -f "${file}.sha256" ]]; then
  (cd "$(dirname "$file")" && sha256sum --check --quiet "$(basename "$file").sha256")
else
  echo '{"event":"restore_warning","reason":"no sha256 file, integrity not checked"}' >&2
fi

start_ms=$(($(date +%s%N) / 1000000))

age --decrypt --identity "$identity" "$file" \
  | pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
    --dbname "$PGDATABASE"

end_ms=$(($(date +%s%N) / 1000000))
printf '{"event":"restore_succeeded","file":"%s","target":"%s/%s","duration_ms":%s}\n' \
  "$(basename "$file")" "$PGHOST" "$PGDATABASE" "$((end_ms - start_ms))"
