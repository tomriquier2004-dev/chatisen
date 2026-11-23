# ChatISEN

Plateforme de communication temps réel : **messagerie**, **appels voix** et **visioconférence**.

> Projet académique DevOps 2026-2027 (ISENA5 Software Engineering).
> « ChatISEN » est un nom de projet, **pas** un service officiel de l'ISEN.

**Défi :** construire une plateforme de communication temps réel fiable, sécurisée et scalable, et **justifier chaque décision d'ingénierie majeure**.

## État

🚧 **Phase 0 — Cadrage.** Pas de code applicatif tant que la spécification et les ADR ne sont pas écrits.

| Livrable | Où |
| --- | --- |
| Suivi des 10 livrables | [`docs/DELIVERABLES.md`](docs/DELIVERABLES.md) |
| Exigences numérotées | [`docs/requirements/requirements.md`](docs/requirements/requirements.md) |
| Architecture cible | [`docs/architecture.md`](docs/architecture.md) |
| Décisions d'architecture | [`docs/adr/`](docs/adr/) |
| Rapport final (13 sections) | [`docs/report/`](docs/report/) |
| Rapports de mesure | [`docs/reports/`](docs/reports/) |
| Équipe, rôles, règles de décision | [`docs/team.md`](docs/team.md) |
| Questions / réponses de l'encadrant | [`docs/prof-qa.md`](docs/prof-qa.md) |
| Registre des risques | [`docs/risks.md`](docs/risks.md) |

## Structure du dépôt

```
apps/web          Client (Preact + TypeScript + Vite)        — prévu
apps/api          API + Socket.IO (Node + TypeScript)        — prévu
packages/shared   Types partagés (contrats d'API et d'événements)
infra/            Docker, Compose, coturn, monitoring, CI/CD
docs/             Spécification, ADR, rapport, rapports de mesure
```

La stack ci-dessus est une **hypothèse de travail** : aucun choix n'est acté tant qu'il n'a pas d'ADR dans `docs/adr/`.

## Règles de décision

- Le propriétaire d'un domaine décide dans son domaine.
- Désaccord entre deux domaines : le Project Owner arbitre.
- Si le Project Owner est partie prenante, les deux autres membres tranchent à la majorité.

Voir [`CONTRIBUTING.md`](CONTRIBUTING.md) pour le workflow Git, les conventions et la définition de « fini ».
