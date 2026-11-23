# Contribuer

## Workflow

1. Une issue existe (ou est créée) pour le travail, rattachée à une ou plusieurs exigences (`FR-xx` / `NFR-xx`).
2. Branche depuis `main` : `feat/<domaine>-<sujet>`, `fix/<domaine>-<sujet>`, `docs/<sujet>`, `chore/<sujet>`.
   Domaines : `backend`, `front`, `infra`, `assurance`.
3. Pull request obligatoire — **`main` est protégée**, aucun push direct.
4. Revue croisée : **1 approbation venant d'un autre domaine**.
5. CI verte requise avant merge. Merge en *squash*.

## Commits et titres de PR — Conventional Commits

```
<type>(<scope>): <description à l'impératif>
```

Types : `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.
Exemple : `feat(api): add refresh token rotation`.

Le titre de la PR suit le même format (il devient le message du squash).

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
