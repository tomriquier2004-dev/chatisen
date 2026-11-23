#!/usr/bin/env bash
# Test de restauration de bout en bout (issue #9) : base peuplée -> sauvegarde chiffrée ->
# restauration dans une base vierge -> comparaison des données -> temps mesurés.
# Prérequis : Docker + Compose v2, Linux (ou WSL). Usage : bash infra/backup/restore-test.sh
# Variable : RESTORE_TEST_ROWS (nombre de messages, multiple de 100, défaut 500000).
# Tout est jetable : mot de passe et clé age générés à la volée, volumes supprimés à la fin.
set -euo pipefail

cd "$(dirname "$0")"
rows="${RESTORE_TEST_ROWS:-500000}"
work="$(mktemp -d)"

export COMPOSE_PROJECT_NAME=chatisen-restore-test
POSTGRES_PASSWORD="$(openssl rand -hex 16)"
export POSTGRES_PASSWORD
export POSTGRES_USER=chatisen POSTGRES_DB=chatisen
dc=(docker compose -f compose.yml --profile restore-test)

cleanup() {
  "${dc[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  find "$work" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$work" 2>/dev/null || true
}
trap cleanup EXIT

now_ms() { echo $(($(date +%s%N) / 1000000)); }
fingerprint() {
  # Nombre de lignes par table + empreinte du contenu des messages, dans un ordre stable.
  "${dc[@]}" exec -T "$1" psql -U chatisen -d "$2" -At -v ON_ERROR_STOP=1 -c "
    SELECT (SELECT count(*) FROM users) || '/' ||
           (SELECT count(*) FROM conversations) || '/' ||
           (SELECT count(*) FROM conversation_members) || '/' ||
           (SELECT count(*) FROM messages) || '/' ||
           (SELECT md5(string_agg(conversation_id::text || seq || body, ',' ORDER BY conversation_id, seq))
              FROM messages)"
}

echo "== Construction de l'image et génération d'une clé age jetable"
"${dc[@]}" build --quiet postgres-backup
docker run --rm --entrypoint age-keygen chatisen/postgres-backup:local >"$work/key.txt" 2>/dev/null
chmod 0644 "$work/key.txt" # lisible par l'utilisateur postgres du conteneur ; clé de test uniquement
BACKUP_AGE_RECIPIENT="$(grep -m1 '^# public key:' "$work/key.txt" | awk '{print $4}')"
export BACKUP_AGE_RECIPIENT

echo "== Démarrage de la base source et de la base cible"
"${dc[@]}" up -d --wait postgres postgres-restore

echo "== Peuplement : ${rows} messages"
"${dc[@]}" exec -T postgres psql -U chatisen -d chatisen -q -v ON_ERROR_STOP=1 -v rows="$rows" <seed.sql
source_fp="$(fingerprint postgres chatisen)"

echo "== Sauvegarde"
t0=$(now_ms)
"${dc[@]}" run --rm -T --entrypoint backup.sh postgres-backup | tee "$work/backup.log"
backup_ms=$(($(now_ms) - t0))
latest="$("${dc[@]}" run --rm -T --entrypoint sh postgres-backup -c 'ls -1t /backups/*.dump.age | head -n 1')"
header="$("${dc[@]}" run --rm -T --entrypoint sh postgres-backup -c "head -c 21 '$latest'")"
if [[ "$header" != "age-encryption.org/v1" ]]; then
  echo "ÉCHEC : la sauvegarde n'est pas chiffrée (en-tête : $header)" >&2
  exit 1
fi
bytes="$(grep -o '"bytes":[0-9]*' "$work/backup.log" | cut -d: -f2)"

echo "== Restauration de ${latest} dans une base vierge"
t0=$(now_ms)
"${dc[@]}" run --rm -T \
  -v "$work/key.txt:/run/secrets/age-identity:ro" \
  -e PGHOST=postgres-restore -e PGDATABASE=chatisen_restore \
  --entrypoint restore.sh postgres-backup "$latest" /run/secrets/age-identity
restore_ms=$(($(now_ms) - t0))

echo "== Vérification"
target_fp="$(fingerprint postgres-restore chatisen_restore)"
if [[ "$source_fp" != "$target_fp" ]]; then
  echo "ÉCHEC : données restaurées différentes de la source" >&2
  echo "source : $source_fp" >&2
  echo "cible  : $target_fp" >&2
  exit 1
fi

summary="$(
  cat <<EOF
### Test de restauration PostgreSQL : réussi

| Mesure | Valeur |
| --- | --- |
| Messages | ${rows} |
| Lignes (users / conversations / members / messages) | ${source_fp%/*} |
| Taille de la sauvegarde chiffrée | $((bytes / 1024)) Kio |
| Durée de la sauvegarde (pg_dump + age, conteneur compris) | ${backup_ms} ms |
| **Durée de la restauration (déchiffrement + pg_restore, conteneur compris)** | **${restore_ms} ms** |
| Empreinte des messages identique | oui (\`${source_fp##*/}\`) |
EOF
)"
echo "$summary"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "$summary" >>"$GITHUB_STEP_SUMMARY"
fi
