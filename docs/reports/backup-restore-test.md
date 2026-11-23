# Rapport : test de restauration PostgreSQL

> Issue #9 · NFR-03, NFR-04, NFR-07 · Runbook : [chapitre 12](../report/12-monitoring-evaluation-operationnelle.md#runbook--sauvegarde-et-restauration-de-postgresql)

## Objectif

Prouver qu'une sauvegarde produite par le service `postgres-backup` se **restaure** intégralement, et mesurer la durée de la restauration (RTO technique).

## Méthodologie

Script [`infra/backup/restore-test.sh`](../../infra/backup/restore-test.sh), exécuté par le workflow [`backup-restore.yml`](../../.github/workflows/backup-restore.yml) :

1. Démarrage de deux PostgreSQL 16 jetables : la source et une cible vierge.
2. Peuplement de la source avec [`seed.sql`](../../infra/backup/seed.sql) : 1 000 utilisateurs, 100 groupes, 1 000 appartenances, 500 000 messages.
3. Sauvegarde par `backup.sh` (`pg_dump -Fc` chiffré par age avec une clé générée pour le test). Contrôle que le fichier commence par l'en-tête `age-encryption.org/v1`, donc qu'il n'est pas en clair.
4. Restauration par `restore.sh` dans la cible (contrôle SHA-256, déchiffrement, `pg_restore --clean --if-exists --exit-on-error`).
5. Comparaison source / cible : nombre de lignes de chaque table et empreinte MD5 de tous les messages (conversation, `seq`, contenu), dans un ordre stable. Toute différence fait échouer le test.

## Résultats

Exécution du 2026-11-23, runner GitHub `ubuntu-latest` ([run 45175796542](https://github.com/tomriquier2004-dev/chatisen/actions/runs/45175796542)).

| Mesure | Valeur |
| --- | --- |
| Lignes (users / conversations / members / messages) | 1 000 / 100 / 1 000 / 500 000 |
| Taille de la sauvegarde chiffrée | 34,0 Mio |
| Sauvegarde, `pg_dump` + chiffrement seuls | 2,9 s |
| Sauvegarde, démarrage du conteneur compris | 4,1 s |
| **Restauration, déchiffrement + `pg_restore` seuls** | **2,4 s** |
| Restauration, démarrage du conteneur compris | 3,6 s |
| Données restaurées identiques | oui (empreinte `4a3b1fb1bd47ea91c44387a8acdb6204` des deux côtés) |

Les mesures à jour de chaque exécution sont dans le résumé du workflow.

## Interprétation

- La restauration fonctionne de bout en bout et redonne des données identiques.
- Pour ce volume, la partie technique de la restauration prend quelques secondes. Le **RTO réel** d'un incident est dominé par les étapes humaines du runbook (diagnostic, récupération de la clé privée, vérifications), à mesurer lors d'un exercice.
- **RPO** : 6 h, fixé par l'intervalle de sauvegarde.

## Limites

- **Données synthétiques** : schéma simplifié d'après l'architecture § 4, messages courts, pas d'index secondaires réels. À rejouer sur les vraies migrations de `apps/api`.
- **Environnement** : runner GitHub (2 vCPU, SSD), pas la VM d'hébergement, encore non choisie. Les durées sont indicatives.
- **Une seule mesure** : pas de moyenne sur plusieurs exécutions ; la durée croît avec le volume, à re-mesurer avec `RESTORE_TEST_ROWS` plus grand si la base grossit.
- **Stockage** : le test vérifie la restauration depuis le volume `pg-backups`, pas depuis une copie hors de l'hôte, qui n'existe pas encore.
- **Clé privée** : générée pour le test ; la procédure de garde de la vraie clé est décrite dans le runbook mais n'est pas testée automatiquement.
