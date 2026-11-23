# ADR-0005 : Contrats partagés avec TypeBox

- **Statut** : proposé
- **Date** : 2026-11-23
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : Mathys (appels), qui utilisera les mêmes contrats pour la signalisation
- **Exigences concernées** : NFR-05, FR-18, NFR-04

## Contexte

Le client et l'API doivent s'accorder sur chaque route REST et chaque événement Socket.IO. Un contrat écrit deux fois finit par diverger. Il faut une seule définition (`packages/shared`) qui serve à la fois : de type TypeScript des deux côtés, de validation à l'exécution côté API (toute entrée non fiable) et, si possible, de validation côté client (réponses de l'API, formulaires).

## Options considérées

1. **Types TypeScript seuls** : aucune validation à l'exécution, donc les entrées ne sont pas contrôlées. Insuffisant (NFR-04).
2. **Zod** : très populaire et lisible. Mais Fastify valide en JSON Schema (Ajv) : il faut convertir chaque schéma Zod (`zod-to-json-schema` ou un type provider), ce qui ajoute une étape et des écarts possibles entre ce que Zod et Ajv acceptent.
3. **JSON Schema écrit à la main + types générés** : standard, mais verbeux, et la génération de types ajoute une étape de build.
4. **TypeBox** : construit directement des JSON Schema, avec le type TypeScript déduit (`Static<typeof Schema>`). Fastify les utilise tels quels. Côté client, `Value.Check` valide avec le même schéma.

## Décision

**TypeBox** (`@sinclair/typebox`) dans `packages/shared`, importé par `apps/api` et `apps/web`. Critère principal : le même objet sert au type, à la validation Fastify et à la validation dans le navigateur, sans conversion.

## Conséquences

- Les schémas de requête, de réponse et d'événement sont définis une seule fois. Un changement de contrat casse la compilation des deux applications, et c'est voulu (architecture § 3).
- Fastify valide chaque entrée et sérialise chaque réponse selon son schéma ; `additionalProperties: false` empêche d'exposer un champ non prévu (par exemple une pile d'appels dans une erreur).
- Le client valide les réponses de l'API (`INVALID_RESPONSE` sinon) et les formulaires avec les mêmes règles.
- **Piège constaté** : `format: "uuid"` ou `format: "email"` sont vérifiés par Ajv côté API mais pas par `Value.Check` côté client sans enregistrement explicite des formats. Nous utilisons donc des **motifs** (`pattern`) pour les UUID et les adresses (`packages/shared/src/ids.ts`, PR #64).
- La validation TypeBox pèse dans le bundle client (une partie des 43 kB gzip mesurés dans l'ADR-0002). Si cela devient gênant, on peut compiler les validateurs utiles ou valider moins côté client.
- TypeBox est moins connu que Zod : la syntaxe (`Type.Object`, `Type.Union`…) est à apprendre, mais elle est proche.
