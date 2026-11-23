#!/usr/bin/env bash
# Sain si la dernière sauvegarde réussie date de moins de deux intervalles.
set -euo pipefail

interval="${BACKUP_INTERVAL_SECONDS:-21600}"
marker="${BACKUP_DIR:-/backups}/last_success"

[[ -f "$marker" ]] || exit 1
age_s=$(($(date -u +%s) - $(<"$marker")))
((age_s < 2 * interval))
