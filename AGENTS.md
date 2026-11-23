# ChatISEN — instructions pour les agents IA

Ce fichier est la **source unique** des règles pour tous les outils (Claude Code, Cursor, Copilot, Codex…). `CLAUDE.md` se contente de l'importer : **ne modifier que `AGENTS.md`**. Un `AGENTS.md` placé dans un sous-dossier complète celui-ci pour les fichiers de ce dossier ; en cas de conflit, la règle la plus spécifique s'applique, sauf si elle viole une exigence de sécurité.

Projet académique **DevOps 2026-2027** (ISEN), équipe de 4. Le dépôt est **public**.
Ce qui est noté : la **justification et la mesure** des décisions d'ingénierie, avec un poids particulier sur l'**infrastructure, la CI/CD et l'exploitation**. Une application qui marche sans ADR, sans mesures ni limites énoncées vaut peu.

Ce fichier est un **index de règles de travail**, pas une documentation : ne pas y recopier l'architecture, les exigences ou les tokens de design ; renvoyer vers les documents ci-dessous.

## Principes

- Le dépôt est la source de vérité de l'état du projet : lire le code et la documentation existants avant de proposer ou de modifier quoi que ce soit.
- Préférer des changements petits, ciblés et relisibles à des réécritures larges.
- Une proposition documentée n'est **pas** une décision acquise. Ne pas changer silencieusement une exigence, un périmètre ou un comportement établi.
- **Ne jamais affirmer qu'une commande, un test, un build ou un déploiement a réussi sans l'avoir exécuté et vérifié le résultat.** Quand les preuves sont incomplètes, dire ce qui est connu, ce qui est supposé et ce qui n'est pas vérifié.
- Ne pas inventer de structure, de script, d'API ou de configuration : si un document cité manque ou contredit le code, le signaler.

## Documents de référence

| Sujet | Document |
| --- | --- |
| Vue d'ensemble | `README.md` |
| Architecture | `docs/architecture.md` |
| Décisions d'architecture | `docs/adr/` (modèle : `0000-template.md`) |
| Design et interface | `docs/DESIGN_SYSTEM.md` |
| Workflow de contribution | `CONTRIBUTING.md` |
| Exigences (`FR-xx`, `NFR-xx`) | `docs/requirements/requirements.md` |
| Livrables, statuts et preuves | `docs/DELIVERABLES.md` |
| Risques | `docs/risks.md` |
| Questions / réponses avec l'encadrant (dates, périmètre, consignes) | `docs/prof-qa.md` |
| Rôles et responsabilités | `docs/team.md` |
| Rapport final (13 chapitres) et rapports de mesure | `docs/report/`, `docs/reports/` |

`CHANGELOG.md` est généré : ne pas l'éditer à la main. Mettre à jour le document de référence concerné plutôt que d'en créer un nouveau ; créer un document seulement si le sujet n'a aucun foyer.

## Langue

Échanges et documentation en **français**. Code, noms d'identifiants, messages de commit et titres de PR en **anglais**.

## Workflow (non négociable)

- **Jamais de push direct sur `main`.** Branche `feat/<domaine>-<sujet>` (ou `fix/`, `docs/`, `chore/`), puis pull request. Domaines : `messagerie`, `appels`, `infra`, `projet`.
- **Titre de PR au format Conventional Commits** : `type(scope): description` (`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`). Commits ciblés, un changement logique chacun.
- **Corps de PR** : suivre le template, avec `Closes #n` et au moins une exigence (`FR-xx`, `NFR-xx` ou `SEC-xx`). S'il n'y a pas d'issue, la créer d'abord (milestone du livrable concerné).
- **Une approbation d'un autre domaine** est requise. Ne pas utiliser le contournement admin pour merger sans approbation, sauf si l'utilisateur le demande explicitement.
- **CI** : « PR hygiene » et « Semgrep (SAST) » doivent être verts. Ne jamais désactiver, assouplir ou contourner un contrôle pour faire passer une PR : corriger la cause. Éditer le titre ou le corps d'une PR ne relance pas la CI.
- Chacun agit avec **son propre compte** `gh`. Ne jamais demander, copier ni utiliser le jeton d'une autre personne.
- Ne pas créer de commit, de branche, de PR ni de release sans que la tâche ou l'utilisateur le demande ; ne pas réécrire l'historique partagé ni forcer un push sans autorisation explicite.
- Ne pas merger, supprimer des branches ou issues, changer des paramètres du dépôt (protection de `main`, collaborateurs, secrets) ni inviter quelqu'un **sans demande explicite** de l'utilisateur. Ne jamais annoncer qu'un changement est poussé, mergé ou déployé si l'opération n'a pas réussi.

## Pour chaque tâche

**Avant** : lire ce fichier et la documentation concernée ; repérer les fichiers et sous-systèmes touchés ; vérifier l'état Git pour ne pas écraser un travail non lié ; identifier les impacts sur l'architecture, la sécurité et l'intégrité des données.
**Pendant** : rester dans le périmètre demandé ; réutiliser les abstractions et conventions existantes ; pas de reformatage, renommage ni mise à jour de dépendance sans lien avec la tâche ; ajouter ou mettre à jour tests et documentation avec le code ; ne pas masquer un travail inachevé par des placeholders ou des messages de succès trompeurs.
**Après** : relire le diff complet (changements accidentels, fichiers générés, secrets) ; exécuter les vérifications disponibles ; vérifier que code et documentation concordent.

## Décisions techniques

- Seuls **Preact + Vite** (client) et **TypeScript + Fastify** (serveur) sont actés. Tout le reste est une **proposition** : une technologie n'est adoptée qu'après un **ADR** rédigé par le domaine concerné et relu par un autre.
- Ne pas introduire de dépendance ou de service structurant sans ADR.
- Toute affirmation de performance, de fiabilité ou de sécurité doit être **mesurée ou testée**, avec méthodologie et **limites** (rapports dans `docs/reports/`). Ne pas écrire de résultat supposé.
- Si une tâche exige une décision d'architecture non prise, exposer les alternatives et demander l'accord avant de trancher.
- Interface : consulter `docs/DESIGN_SYSTEM.md` avant de créer ou modifier un composant ; réutiliser les tokens existants au lieu d'en inventer ; proposer une mise à jour du design system plutôt que d'ouvrir une convention concurrente.

## Sécurité

- **Aucun secret dans le dépôt** (il est public). `.env` est ignoré ; `.env.example` ne contient aucune valeur réelle. Ne pas exposer de valeur sensible dans les logs, jeux de test, documents ou messages d'erreur.
- Aucune donnée personnelle (adresse e-mail, identifiants) dans le code, les docs, les issues ou les PR. Pour git, utiliser l'adresse `noreply` de GitHub.
- Actions GitHub **épinglées par SHA** de commit ; dépendances avec un délai de 7 jours (Dependabot, `minimumReleaseAge` pnpm).
- Le contrôle d'accès est vérifié **côté serveur**, jamais par le client. Valider toute entrée non fiable aux frontières du système ; principe du moindre privilège.
- Ne pas affaiblir l'authentification, l'autorisation, la validation ou un contrôle de sécurité pour faciliter une tâche. Ne pas lancer de commande destructive ni toucher à une ressource de production sans autorisation explicite.
- Une vulnérabilité découverte est signalée clairement, sans ajouter d'exposition.

## Commandes et vérifications

Ne jamais inventer de commande. Avant d'exécuter quelque chose, vérifier dans les `package.json`, le lockfile, la configuration du workspace et les workflows CI que cela existe (Node ≥ 22, pnpm : voir `package.json`). Ne pas supposer que `pnpm build`, `test`, `lint` ou `dev` existent. Exécuter uniquement des commandes vérifiées et rapporter les commandes exactes et leur résultat ; s'il n'existe aucune vérification automatique pertinente, le dire.

## Demander avant de faire

Remplacer ou ajouter un framework, une bibliothèque ou un service d'infrastructure · changer une décision d'architecture ou un ADR · modifier un schéma de base de données ou la rétention des données de façon potentiellement destructive · changer l'authentification, l'autorisation ou une politique de sécurité hors de la tâche demandée · casser une API ou un protocole · changer une exigence ou le périmètre · ajouter une dépendance à fort enjeu de maintenance, de sécurité ou de licence · toute opération destructive ou sur la production · trancher alors que les exigences ou la documentation sont matériellement ambiguës.

## Structure du dépôt

```
apps/web          Client (Preact + Vite)
apps/api          API + Socket.IO (Fastify)
packages/shared   Types et schémas partagés (contrats REST / événements)
infra/            Docker, Compose, coturn, monitoring, CI/CD
docs/             Spécification, architecture, ADR, rapport (13 chapitres), rapports de mesure
```

`apps/web` et `apps/api` ne dépendent que de `packages/shared`, jamais l'un de l'autre. Garder les fonctionnalités communes dans le paquet partagé ; éviter les dépendances circulaires et le couplage caché.

## Définition de « fini »

Comportement demandé implémenté ; conventions et frontières d'architecture respectées ; tests ajoutés ou mis à jour ; vérifications disponibles exécutées ; code mergé avec CI verte ; documentation de référence mise à jour (chapitre du rapport, ADR, `docs/DELIVERABLES.md`) ; diff relu, sans changement non lié ni secret.

Le compte rendu final indique : ce qui a changé et quels fichiers ; les vérifications exécutées et leur résultat ; celles qui n'ont pas pu l'être ; les risques, hypothèses et suites éventuels.

## En cas de doute

Ne pas deviner : inspecter le dépôt, consulter la documentation de référence, expliquer l'incertitude et demander l'accord quand la décision dépasse le périmètre de la tâche.
