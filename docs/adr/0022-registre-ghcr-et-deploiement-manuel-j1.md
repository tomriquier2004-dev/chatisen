# ADR-0022 : Registre GHCR, images taguées par SHA, scan Trivy bloquant et déploiement manuel en J1

- **Statut** : proposé
- **Date** : 2026-11-25
- **Auteur (domaine)** : Sha (infra)
- **Relecteur (autre domaine)** : Tom (Flex)
- **Exigences concernées** : NFR-04, NFR-07
- **Issue** : #12

## Contexte

- Le jalon J1 (27 novembre) exige un squelette déployé : Compose sur l'hôte, CI avec build et Trivy, inscription, connexion et messagerie sur le nom de domaine. Il n'existe encore ni Dockerfile, ni registre, ni Compose de déploiement (issue #12).
- Périmètre validé avec Tom : la CI construit et publie les images, la VM est déployée à la main (`docker compose pull` puis `up -d`). Le mécanisme automatique (F09) n'est pas tranché, l'IAP n'est pas en place et les environnements GitHub dépendent du propriétaire du dépôt.
- Contrainte relevée par Tom sur l'issue #12 : le client utilise `crypto.randomUUID()` et `navigator.locks`, réservés aux contextes sécurisés. Il doit être servi en **HTTPS dès le premier déploiement**.
- L'hôte est une VM x86_64 ([ADR-0012](0012-deploiement-et-hebergement.md)), donc des images `amd64` suffisent.

## Options considérées

**Registre d'images**

1. **GitHub Container Registry (GHCR)** — intégré à GitHub, le `GITHUB_TOKEN` du workflow suffit (aucun secret supplémentaire), rattaché au dépôt, sans coût pour un dépôt public.
2. **Docker Hub** — très répandu, mais un compte et un jeton de plus à gérer, avec des limites de téléchargement.
3. **Artifact Registry (Google Cloud)** — proche de la VM, mais exige une identité GCP pour la CI (fédération d'identité ou clé), non prête.
4. **Pas de registre : construire sur la VM** — aucune dépendance externe, mais la VM compile à chaque déploiement et rien n'atteste que l'image déployée est celle qui a été scannée.

**Déploiement**

A. **À la main** sur la VM (`pull` puis `up -d`) — simple, rien à sécuriser côté CI, mais une étape humaine.
B. **Depuis la CI par SSH via IAP** — automatique, mais demande l'IAP, un compte de service et des secrets (F09 non tranché).
C. **La VM tire elle-même les nouvelles images** — évite d'ouvrir un accès à la CI, mais ajoute un composant résident.

## Décision

1. **GHCR** (option 1), images `ghcr.io/<propriétaire>/chatisen/{api,web,postgres-backup}`. Elles sont **publiques** : elles ne contiennent aucun secret (ceux-ci viennent du `.env` de la VM). Le réglage de visibilité est fait une fois par le propriétaire du dépôt.
2. **Tags** : `sha-<12 premiers caractères du commit>` (déploiement reproductible) et `main` (dernier build, mobile). `IMAGE_TAG` est **obligatoire** dans le Compose, sans valeur par défaut, pour ne pas déployer un tag mobile sans le savoir.
3. **Scan Trivy bloquant** sur CRITICAL et HIGH avec `--ignore-unfixed`, proposition de Tom en attendant l'ADR-0015. L'image publiée est **celle qui a été scannée** (construite une fois, scannée, puis poussée). Les exceptions sont dans `.trivyignore`, avec justification et date de revue.
4. **Images de base épinglées par condensat**, mises à jour par Dependabot (`docker` et `docker-compose`).
5. **Durcissement** : l'image de l'API n'embarque ni npm ni pnpm (leurs dépendances faisaient échouer le scan sans servir) et s'exécute en utilisateur `node` ; l'image de sauvegarde n'embarque plus `gosu` ; les conteneurs de l'API s'exécutent en lecture seule, sans capacité Linux, avec `no-new-privileges`.
6. **Déploiement manuel en J1** (option A), commandes documentées dans [`infra/README.md`](../../infra/README.md). Le déploiement automatique est reporté après J1.

## Conséquences

- **Étape humaine au déploiement** : risque d'oubli ou d'erreur de tag. Atténué par des commandes documentées, des contrôles de santé et le retour arrière. Celui-ci n'est reproductible que si l'on déploie le **même commit** pour la configuration (`Caddyfile`, `compose.prod.yml`) que pour les images : `git checkout <sha>` puis `IMAGE_TAG` correspondant (runbook).
- **Images publiques** : n'importe qui peut les télécharger. Rien de sensible n'y entre (`.dockerignore`, secrets à l'exécution), mais il faut le garder vrai à chaque modification des Dockerfiles.
- **Dépendance à GHCR** : en cas d'indisponibilité, `compose.build.yml` construit les images sur la VM (secours, sans preuve que l'image est celle qui a été scannée).
- **Exception Trivy** : CVE-2026-78661 (`golang.org/x/net` dans le binaire de Caddy 2.11.9, déni de service par HTML forgé). Aucun Caddy corrigé n'existe au 2026-11-25 et notre configuration n'interprète pas de HTML fourni par un client. **À revoir le 2026-12-02.**
- **Mesures** : les trois images se construisent et passent Trivy sans faille bloquante, en local puis dans le workflow `Images` sur la pull request. La pile démarre et répond en HTTP en local ; la publication sur `main` et le déploiement HTTPS ne sont pas encore vérifiés.
- **PostgreSQL sur la VM est provisoire (J1)** : le Compose de déploiement garde un conteneur PostgreSQL et la sauvegarde `pg_dump`. La cible est Cloud SQL ([ADR-0017](0017-base-de-donnees-cloud-sql.md)), qui les remplacera ; cet ADR ne décide pas ce changement.
- **Images `amd64` seulement**, comme l'hôte. À rouvrir si l'hôte change d'architecture.
- **À revoir** quand le déploiement automatique (F09) sera tranché, si GHCR pose problème, ou si Terraform ([ADR-0018](0018-terraform-et-load-balancer-gcp.md)) prend en charge le déploiement.

## À vérifier avant de passer à « accepté »

- [x] Le workflow `Images` est vert sur une pull request (build et Trivy des trois images).
- [ ] Les images sont publiées sur `main` et leur visibilité est publique.
- [ ] Déploiement sur la VM : `pull`, `up -d`, services « healthy », HTTPS avec certificat valide.
- [ ] Inscription, connexion et envoi d'un message sur le nom de domaine, en HTTPS.
- [ ] Sauvegarde chiffrée produite sur la VM (clé publique age fournie).
- [ ] Exception Trivy sur Caddy revue à la date prévue.
