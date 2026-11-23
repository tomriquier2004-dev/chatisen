# ADR-0001 : Consigner les décisions d'architecture

- **Statut** : accepté
- **Date** : 2026-11-23
- **Exigences concernées** : NFR-05

## Contexte

Le briefing indique que l'architecture et chaque choix technologique font partie du travail noté, et que chaque décision majeure doit être justifiée.

## Options considérées

1. Justifier uniquement dans le rapport final — risque de reconstruction a posteriori et d'oubli.
2. Un ADR par décision, au moment où elle est prise, dans le dépôt.

## Décision

Option 2. Un fichier par décision dans `docs/adr/`, numéroté, au format de `0000-template.md`. Le domaine owner rédige ; un autre domaine relit.

## Conséquences

Le livrable « Justification » se construit au fil de l'eau. Une PR qui change l'architecture sans ADR doit être refusée en revue.
