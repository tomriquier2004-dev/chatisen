# ADR-0014 : Versionnement et releases automatisés avec release-please

- **Statut** : proposé
- **Date** : 2026-11-23
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : Tom (Flex, propriétaire des releases)
- **Exigences concernées** : NFR-07, NFR-05

> Numéro 0014 : les numéros 0002 à 0013 sont déjà réservés par la liste du § 12 de [`architecture.md`](../architecture.md).

## Contexte

`docs/team.md` confie à Flex le versionnement, les tags, le changelog et l'exercice de rollback. Les images sont taguées par SHA de commit (architecture § 8.2), ce qui suffit pour redéployer, mais ne dit pas **ce qui a changé** entre deux déploiements ni à quelle version correspond une démo. Les titres de PR suivent déjà Conventional Commits (vérifié par la CI) et deviennent le message du squash : l'information nécessaire existe déjà sur `main`.

## Options considérées

1. **Versionnement manuel** (tag + changelog écrits à la main) — aucun outillage, mais oublis et changelog incomplet garantis sur un projet à 4.
2. **semantic-release** — entièrement automatique : chaque merge peut publier une release. Pas d'étape de validation humaine, configuration par plugins plus lourde, pensé d'abord pour publier sur npm.
3. **Changesets** — très adapté aux monorepos qui publient des paquets, mais demande un fichier « changeset » écrit à la main dans chaque PR : une étape de plus que personne ne vérifie.
4. **release-please** (Google) — une GitHub Action lit les commits de `main` et maintient une **Release PR** qui calcule la version (`feat` → mineure, `fix` → patch, `!` → majeure ; avant 1.0.0, `feat` → mineure et `!` → mineure aussi), met à jour `CHANGELOG.md` et `package.json`. La release (tag + release GitHub) n'est créée **que quand on merge cette PR**.

## Décision

Option 4, **release-please**, avec une version unique pour tout le monorepo :

- les applications sont privées et déployées ensemble, donc une version par paquet n'apporterait rien ;
- la Release PR laisse à Flex le choix du moment de la release (par exemple avant une démo) ;
- aucun effort supplémentaire par PR : un titre de PR propre suffit, et la CI le vérifie déjà.

Configuration : `release-please-config.json` (type `node`, première version `0.1.0`, tags `vX.Y.Z`, changelog en français : fonctionnalités, corrections, performances, documentation), `.release-please-manifest.json`, workflow `.github/workflows/release-please.yml` (action épinglée par SHA, permissions limitées au job).

## Conséquences

- **Le titre de PR fait le changelog.** Merge en squash obligatoire (déjà la règle), et un titre mal typé produit une version fausse. Un `feat` qui n'en est pas un déclenche une version mineure.
- **Le réglage « Allow GitHub Actions to create and approve pull requests » n'est pas activé** : il permettrait à un workflow d'approuver une PR avec le `GITHUB_TOKEN`, ce qui peut contourner la règle « 1 approbation d'un autre domaine ». Il reste désactivé.
- **Jeton dédié** : l'action utilise le secret `RELEASE_PLEASE_TOKEN` (PAT fine-grained, limité à ce dépôt, Contents et Pull requests en écriture, expiration courte). Une PR ouverte avec ce jeton déclenche la CI : les checks requis par la protection de `main` reportent, la Release PR est mergeable. Sans ce jeton, le workflow échoue (constaté après le merge de la PR #23).
- **Limites assumées du jeton** : il est lié à un compte (les Release PR sont ouvertes au nom de son propriétaire, qui ne peut donc pas les approuver lui-même) ; il expire et doit être renouvelé ; tout membre pouvant exécuter un workflow sur une branche du dépôt peut lire le secret, d'où le périmètre minimal et l'expiration courte.
- Le job « PR hygiene » n'ignore que les PR dont la branche commence par `release-please--` **et** dont le titre commence par `chore(main): release `, dont le corps est généré.
- Les images restent taguées par SHA ; le tag de version s'y ajoute au moment du build quand la chaîne de déploiement existera (issue #12).
- À revoir si un paquet est un jour publié séparément (passer à une version par paquet dans la config).
