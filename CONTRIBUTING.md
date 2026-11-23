# Contribuer

## Workflow

1. Une issue existe (ou est créée) pour le travail, rattachée à une ou plusieurs exigences (`FR-xx` / `NFR-xx`).
2. Branche depuis `main` : `feat/<domaine>-<sujet>`, `fix/<domaine>-<sujet>`, `docs/<sujet>`, `chore/<sujet>`.
   Domaines : `messagerie`, `appels`, `infra`, `projet`.
3. Pull request obligatoire — **`main` est protégée**, aucun push direct.
4. Revue croisée : **1 approbation venant d'un autre domaine**.
5. CI verte requise avant merge. Merge en *squash*.

## Vérifications locales

Prérequis : Node ≥ 22 et pnpm (version fixée par `packageManager` dans `package.json` ; `corepack enable`, ou `npx pnpm@<version>` si corepack n'est pas disponible).

```bash
pnpm install      # dépendances de tout le monorepo
pnpm lint         # ESLint sur tout le dépôt
pnpm typecheck    # tsc --noEmit dans chaque paquet
pnpm test         # Vitest dans chaque paquet
pnpm build        # build de chaque paquet qui en a un
```

Ce sont les mêmes commandes que le job CI « Lint, typecheck, tests ».

## Commits et titres de PR — Conventional Commits

```
<type>(<scope>): <description à l'impératif>
```

Types : `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.
Exemple : `feat(api): add refresh token rotation`.

Le titre de la PR suit le même format (il devient le message du squash).

## Versions et releases

Les versions sont calculées par [release-please](https://github.com/googleapis/release-please) à partir des titres de PR mergées sur `main` ([ADR-0014](docs/adr/0014-release-please.md)) :

- `feat` → version mineure, `fix` → patch, `!` (ex. `feat(api)!: …`) → changement cassant ;
- `docs` apparaît aussi dans le changelog ; `ci`, `chore`, `build`, `test`, `refactor` n'y apparaissent pas.

Conséquences : **toujours merger en squash** et **soigner le titre de la PR**, c'est lui qui finit dans `CHANGELOG.md`. release-please tient à jour une PR « chore(main): release x.y.z » ; la merger crée le tag `vx.y.z` et la release GitHub. Ne pas éditer `CHANGELOG.md` à la main.

## Traçabilité

- Chaque PR référence l'exigence adressée (`FR-xx`, `NFR-xx`) **et** une issue (`Closes #n`).
- Une décision d'architecture = un fichier dans [`docs/adr/`](docs/adr/) (modèle : `0000-template.md`).
  Le domaine owner l'écrit, **un autre domaine la relit**.
- Toute mesure (benchmark, test de charge, scan sécurité) produit un rapport dans `docs/reports/`
  avec méthodologie **et limites**.

## Definition of Done (par phase)

Une phase n'est pas terminée tant que :

- le code est mergé sur `main` avec CI verte ;
- les tests automatisés couvrent les exigences adressées ;
- le chapitre correspondant de `docs/report/` est écrit ;
- les ADR de la phase sont écrits et relus ;
- `docs/DELIVERABLES.md` est à jour (statut + lien vers la preuve).

## Secrets

Aucun secret dans le dépôt (public). Utiliser `.env` local (ignoré) et GitHub Secrets. Voir `.env.example`.
