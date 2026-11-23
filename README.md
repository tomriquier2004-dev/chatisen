# ChatISEN

Plateforme de communication temps réel : **messagerie**, **appels voix** et **visioconférence**.

> Projet académique DevOps 2026-2027 (ISENA5 Software Engineering).
> « ChatISEN » est un nom de projet, **pas** un service officiel de l'ISEN.

**Défi :** construire une plateforme de communication temps réel fiable, sécurisée et scalable, et **justifier chaque décision d'ingénierie majeure**.

## État

🚧 **Squelette de l'application en cours** (jalon J0 du [planning](docs/planning.md)) : outillage, contrats partagés, API et client minimaux, sans logique métier.

| Livrable | Où |
| --- | --- |
| Planning jusqu'à la soutenance (11 déc.) | [`docs/planning.md`](docs/planning.md) |
| Suivi des 10 livrables | [`docs/DELIVERABLES.md`](docs/DELIVERABLES.md) |
| Exigences numérotées | [`docs/requirements/requirements.md`](docs/requirements/requirements.md) |
| Architecture cible | [`docs/architecture.md`](docs/architecture.md) |
| Design system (UI) | [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) |
| Décisions d'architecture | [`docs/adr/`](docs/adr/) |
| Rapport final (13 sections) | [`docs/report/`](docs/report/) |
| Rapports de mesure | [`docs/reports/`](docs/reports/) |
| Équipe, rôles, règles de décision | [`docs/team.md`](docs/team.md) |
| Questions / réponses de l'encadrant | [`docs/prof-qa.md`](docs/prof-qa.md) |
| Registre des risques | [`docs/risks.md`](docs/risks.md) |
| Historique des versions | [`CHANGELOG.md`](CHANGELOG.md) |

## Structure du dépôt

```
apps/web          Client (Preact + TypeScript + Vite)        — squelette
apps/api          API + Socket.IO (Node + TypeScript)        — squelette (Fastify, sans Socket.IO)
packages/shared   Types partagés (contrats d'API et d'événements)
infra/            Docker, Compose, coturn, monitoring, CI/CD
docs/             Spécification, ADR, rapport, rapports de mesure
```

## Lancer en local

Prérequis : Node ≥ 22 et pnpm (version fixée par `packageManager` dans `package.json` : `corepack enable`, ou préfixer les commandes par `npx pnpm@10.34.9` si corepack n'est pas disponible).

```bash
pnpm install
pnpm dev
```

`pnpm dev` démarre ensemble l'API (http://127.0.0.1:3000, rechargée à chaque modification) et le client (http://127.0.0.1:5173). Ouvrir **http://127.0.0.1:5173** : le client relaie `/api` vers l'API, et la page d'accueil affiche « API : opérationnelle » quand les deux tournent. `Ctrl+C` arrête les deux.

Pas encore de base de données ni de Docker à ce stade. Vérifications : voir [`CONTRIBUTING.md`](CONTRIBUTING.md#vérifications-locales).

La stack ci-dessus est une **hypothèse de travail** : aucun choix n'est acté tant qu'il n'a pas d'ADR dans `docs/adr/`.

## Règles de décision

- Le propriétaire d'un domaine décide dans son domaine.
- Désaccord entre deux domaines : le Project Owner arbitre.
- Si le Project Owner est partie prenante, les deux autres membres tranchent à la majorité.

Voir [`CONTRIBUTING.md`](CONTRIBUTING.md) pour le workflow Git, les conventions et la définition de « fini ».
