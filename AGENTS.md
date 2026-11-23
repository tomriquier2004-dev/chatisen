# ChatISEN — instructions pour les agents IA

Ce fichier est la **source unique** des règles pour tous les outils (Claude Code, Cursor, Copilot, Codex…). `CLAUDE.md` se contente de l'importer : **ne modifier que `AGENTS.md`**.

Projet académique **DevOps 2026-2027** (ISEN), équipe de 4. Le dépôt est **public**.
Ce qui est noté : la **justification et la mesure** des décisions d'ingénierie, avec un poids particulier sur l'**infrastructure, la CI/CD et l'exploitation**. Une application qui marche sans ADR, sans mesures ni limites énoncées vaut peu.

## À lire avant de travailler

`README.md`, `CONTRIBUTING.md`, `docs/team.md` (rôles et responsabilités), `docs/requirements/requirements.md` (FR/NFR), `docs/architecture.md`, `docs/adr/`, `docs/DELIVERABLES.md`, `docs/risks.md`.

## Langue

Échanges et documentation en **français**. Code, noms d'identifiants, messages de commit et titres de PR en **anglais**.

## Workflow (non négociable)

- **Jamais de push direct sur `main`.** Branche `feat/<domaine>-<sujet>` (ou `fix/`, `docs/`, `chore/`), puis pull request. Domaines : `messagerie`, `appels`, `infra`, `projet`.
- **Titre de PR au format Conventional Commits** : `type(scope): description` (`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`).
- **Corps de PR** : suivre le template, avec `Closes #n` et au moins une exigence (`FR-xx`, `NFR-xx` ou `SEC-xx`). S'il n'y a pas d'issue, la créer d'abord (milestone du livrable concerné).
- **Une approbation d'un autre domaine** est requise. Ne pas utiliser le contournement admin pour merger sans approbation, sauf si l'utilisateur le demande explicitement.
- **CI** : « PR hygiene » et « Semgrep (SAST) » doivent être verts. Ne jamais désactiver, assouplir ou contourner un contrôle pour faire passer une PR : corriger la cause. Éditer le titre ou le corps d'une PR ne relance pas la CI.
- Chacun agit avec **son propre compte** `gh`. Ne jamais demander, copier ni utiliser le jeton d'une autre personne.
- Ne pas merger, supprimer des branches ou issues, changer des paramètres du dépôt (protection de `main`, collaborateurs, secrets) ni inviter quelqu'un **sans demande explicite** de l'utilisateur.

## Décisions techniques

- Seuls **Preact + Vite** (client) et **TypeScript + Fastify** (serveur) sont actés. Tout le reste est une **proposition** : une technologie n'est adoptée qu'après un **ADR** (`docs/adr/0000-template.md`) rédigé par le domaine concerné et relu par un autre.
- Ne pas introduire de dépendance ou de service structurant sans ADR.
- Toute affirmation de performance, de fiabilité ou de sécurité doit être **mesurée ou testée**, avec méthodologie et **limites** (rapports dans `docs/reports/`). Ne pas écrire de résultat supposé.

## Sécurité

- **Aucun secret dans le dépôt** (il est public). `.env` est ignoré ; `.env.example` ne contient aucune valeur réelle.
- Aucune donnée personnelle (adresse e-mail, identifiants) dans le code, les docs, les issues ou les PR. Pour git, utiliser l'adresse `noreply` de GitHub.
- Actions GitHub **épinglées par SHA** de commit ; dépendances avec un délai de 7 jours (Dependabot, `minimumReleaseAge` pnpm).
- Le contrôle d'accès est vérifié **côté serveur**, jamais par le client.

## Structure du dépôt

```
apps/web          Client (Preact + Vite)
apps/api          API + Socket.IO (Fastify)
packages/shared   Types et schémas partagés (contrats REST / événements)
infra/            Docker, Compose, coturn, monitoring, CI/CD
docs/             Spécification, architecture, ADR, rapport (13 chapitres), rapports de mesure
```

`apps/web` et `apps/api` ne dépendent que de `packages/shared`, jamais l'un de l'autre.

## Définition de « fini »

Code mergé avec CI verte ; tests couvrant les exigences visées ; chapitre du rapport (`docs/report/`) et ADR écrits ; `docs/DELIVERABLES.md` à jour.

## Outillage

Node ≥ 22, pnpm 10 (voir `package.json`). Aucun script applicatif n'existe encore : les ajouter à cette section au fil des phases (build, test, lint, lancement local).
