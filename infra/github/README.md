# Règles du dépôt GitHub (en code)

Les règles de protection sont décrites ici, relues en PR, puis **appliquées par le propriétaire du dépôt** : sur un dépôt personnel, créer ou modifier un ruleset exige le rôle propriétaire.

| Fichier | Rôle |
| --- | --- |
| `rulesets/main.json` | `main` : PR obligatoire (1 approbation, revue des propriétaires de code, approbation annulée si le code change), checks requis (`PR hygiene`, `Semgrep (SAST)`), branche à jour, historique linéaire, pas de force-push ni de suppression, **aucun contournement** |
| `rulesets/tags-v.json` | Tags `v*` : suppression et déplacement interdits |
| `../../.github/CODEOWNERS` | `.github/workflows/` et `infra/` exigent l'approbation de Sha, de Tom ou de Théo |

## Appliquer (propriétaire)

```bash
gh api -X POST repos/tomriquier2004-dev/chatisen/rulesets --input infra/github/rulesets/main.json
gh api -X POST repos/tomriquier2004-dev/chatisen/rulesets --input infra/github/rulesets/tags-v.json
```

Pour mettre à jour un ruleset existant : retrouver son identifiant, puis le remplacer.

```bash
gh api repos/tomriquier2004-dev/chatisen/rulesets --jq '.[] | "\(.id) \(.name)"'
gh api -X PUT repos/tomriquier2004-dev/chatisen/rulesets/<id> --input infra/github/rulesets/main.json
```

## Vérifier avant de supprimer la protection classique

1. Appliquer les rulesets **en gardant** la protection classique de `main`.
2. Ouvrir une PR de test : le merge doit être refusé sans approbation, et une modification de `.github/workflows/` ou `infra/` doit exiger Sha ou Tom.
3. Seulement ensuite, supprimer l'ancienne règle (Settings → Branches), pour ne pas avoir deux règles en doublon.

## Limites

- **Aucun contournement** (`bypass_actors: []`), y compris pour le propriétaire. En cas d'urgence absolue ou d'absence de tout relecteur, seul le propriétaire peut modifier le ruleset temporairement ; **chaque exception est tracée dans une issue**.
- **Un relecteur absent bloque** : une PR de Sha sur `infra/` ne peut être approuvée que par Tom, et inversement.
- Un workflow modifié dans une PR s'exécute depuis sa branche avant toute revue : `CODEOWNERS` contrôle ce qui est **mergé**, pas ce qui s'exécute avant.
- Ces fichiers décrivent l'état voulu : une modification faite à la main dans l'interface GitHub les rend caducs. Toujours passer par ce dossier.
