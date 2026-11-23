# 12. Monitoring et évaluation opérationnelle

> Statut : 🔴 à écrire

## Ce que ce chapitre doit établir

- Dashboards, logs, alerting (preuves de monitoring)
- Détection et investigation de pannes
- Analyse des données d'usage et de qualité ; PoC IA évalué avec une métrique (résultats mesurés, pas supposés)

## Contenu

_À rédiger._

## Runbook : sauvegarde et restauration de PostgreSQL

> Issue #9 · NFR-03, NFR-04, NFR-07 · Code : [`infra/backup/`](../../infra/backup/) · Topologie : [architecture § 8.1](../architecture.md#81-topologie-docker-compose)

### Principe

| Élément | Choix |
| --- | --- |
| Outil | `pg_dump --format=custom` (sauvegarde logique, restaurable avec `pg_restore`) |
| Chiffrement | [age](https://age-encryption.org), **asymétrique** : le serveur ne détient que la clé publique (`BACKUP_AGE_RECIPIENT`). Un attaquant qui prend le serveur ne peut pas lire les sauvegardes. |
| Planification | Service Compose `postgres-backup` : une sauvegarde au démarrage, puis toutes les 6 h (`BACKUP_INTERVAL_SECONDS`) |
| Stockage | Volume `pg-backups`, **distinct** du volume de la base `pg-data` ; fichier `chatisen-<horodatage UTC>.dump.age` + `.sha256` |
| Rétention | 7 jours (`BACKUP_RETENTION_DAYS`), purge uniquement après une sauvegarde réussie |
| Objectifs | **RPO** (perte de données max) = 6 h · **RTO** technique mesuré : 2,4 s pour 500 000 messages (déchiffrement + `pg_restore`, [rapport](../reports/backup-restore-test.md)) ; le RTO réel inclut les étapes humaines ci-dessous |
| Supervision | Healthcheck Docker : `unhealthy` si aucune sauvegarde réussie depuis 2 intervalles ; logs JSON (`backup_succeeded`, `backup_failed`) |
| Preuve | Workflow [`backup-restore.yml`](../../.github/workflows/backup-restore.yml) : sauvegarde chiffrée, restauration dans une base vierge et comparaison des données, à chaque PR qui touche `infra/backup/` et chaque lundi |

### Mise en place (une fois)

1. Sur un **poste de l'équipe** (pas le serveur), générer la paire de clés : `age-keygen -o chatisen-backup.key`. La commande affiche la clé publique (`age1…`).
2. Ranger la clé privée `chatisen-backup.key` **hors du serveur, en deux exemplaires** (gestionnaire de mots de passe de l'équipe + copie hors ligne). Perdre la clé privée = perdre toutes les sauvegardes.
3. Sur le serveur, mettre la clé publique dans `.env` : `BACKUP_AGE_RECIPIENT=age1…`. Elle n'est pas secrète.
4. `docker compose up -d postgres-backup`, puis vérifier : `docker compose logs postgres-backup` doit montrer `backup_succeeded`, et `docker compose ps` l'état `healthy` après le premier intervalle de healthcheck.

### Vérifier les sauvegardes

```bash
docker compose exec postgres-backup ls -lh /backups
docker compose exec postgres-backup sh -c 'cd /backups && sha256sum --check *.sha256'
docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q postgres-backup)"
```

### Restaurer (incident : base perdue ou corrompue)

1. **Prévenir** l'équipe et noter l'heure de début (mesure du RTO réel).
2. **Arrêter les écritures** : `docker compose stop api`. Le client affiche déjà une erreur explicite quand la base est indisponible (architecture § 10.2).
3. **Choisir la sauvegarde** : en général la plus récente, `docker compose exec postgres-backup ls -1t /backups`. Si la corruption est ancienne, prendre la dernière sauvegarde antérieure à l'incident.
4. **Copier la clé privée sur le serveur, temporairement** (par exemple dans `/run/user/$UID/age-identity`, en mémoire) avec les droits `0400`.
5. **Recréer une base vide** si le volume est perdu : `docker compose up -d postgres` (crée `chatisen` vide), attendre `healthy`.
6. **Restaurer** :
   ```bash
   docker compose run --rm -T \
     -v /run/user/$UID/age-identity:/run/secrets/age-identity:ro \
     --entrypoint restore.sh postgres-backup \
     /backups/chatisen-AAAAMMJJTHHMMSSZ.dump.age /run/secrets/age-identity
   ```
   Le script vérifie l'empreinte SHA-256, déchiffre, puis lance `pg_restore --clean --if-exists --exit-on-error`. **`--clean` remplace le contenu de la base cible** : toujours vérifier `PGHOST` / `PGDATABASE` avant. La sortie donne `duration_ms`.
7. **Supprimer la clé privée du serveur** dès la fin de la restauration.
8. **Vérifier** : `docker compose exec postgres psql -U chatisen -c 'SELECT count(*) FROM messages'`, puis `GET /api/v1/health/ready`.
9. **Rouvrir** : `docker compose start api`. Les clients se reconnectent et rattrapent par `seq` (§ 6.3) ; les messages postérieurs à la sauvegarde sont perdus (RPO). Les messages restés en file d'attente locale côté client sont renvoyés avec leur `clientMsgId`.
10. **Post-mortem** : heure de l'incident, sauvegarde utilisée, données perdues, RTO réel, cause.

### Tester la restauration sans toucher la production

```bash
bash infra/backup/restore-test.sh                       # 500 000 messages par défaut
RESTORE_TEST_ROWS=2000000 bash infra/backup/restore-test.sh
```

Le script crée une base jetable, la peuple, la sauvegarde avec une clé age jetable, restaure dans une seconde base vierge, compare le nombre de lignes de chaque table et une empreinte MD5 du contenu des messages, puis affiche les durées. Il tourne sous Linux, macOS ou WSL avec Docker (les durées côté hôte utilisent `date +%s%N`, ou perl quand `date` ne le permet pas, comme sur macOS). Résultats et limites : [`docs/reports/backup-restore-test.md`](../reports/backup-restore-test.md).

### Limites actuelles

- **Pas encore de copie hors de l'hôte.** Le volume `pg-backups` est distinct de celui de la base, mais sur la même machine : la perte du disque ou de la VM fait tout perdre. Une copie distante (stockage objet, `rclone`) dépend du choix d'hébergement, encore ouvert (question 4 de [`prof-qa.md`](../prof-qa.md)).
- **Pas de restauration à un instant précis** (PITR / archivage WAL) : la granularité est l'intervalle de sauvegarde. Suffisant pour le périmètre du projet ; à reconsidérer si le RPO de 6 h devient inacceptable.
- **Test sur données synthétiques** : le schéma de `seed.sql` imite le § 4 de l'architecture, en attendant les vraies migrations de `apps/api`.
- **Alerte Prometheus à ajouter** quand la stack de monitoring existera (âge de la dernière sauvegarde, échecs).
