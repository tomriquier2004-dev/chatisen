# ADR-0003 : Serveur en Node + TypeScript + Fastify

- **Statut** : accepté (choix acté par l'équipe en phase 0, formalisé ici)
- **Date** : 2026-11-23
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : à désigner (appels ou infra)
- **Exigences concernées** : NFR-01, NFR-05, NFR-06, FR-18

## Contexte

L'API sert le REST (auth, conversations, historique) **et** le temps réel (Socket.IO, signalisation WebRTC) dans le même processus. Elle doit valider toutes les entrées, renvoyer un format d'erreur unique (FR-18), produire des logs structurés et des métriques (NFR-06), et partager ses types avec le client.

## Options considérées

1. **Express** : le plus connu, mais pas de validation de schéma ni de typage des routes intégrés, logs à ajouter, maintenance lente (Express 5 sorti après des années).
2. **NestJS** : structure forte (modules, injection de dépendances, décorateurs), mais beaucoup de concepts et de code d'infrastructure pour une API de cette taille, et une courbe d'apprentissage pour l'équipe.
3. **Fastify** : validation et sérialisation par JSON Schema intégrées, logs JSON natifs (pino) avec identifiant de requête, système de plugins encapsulés, `inject()` pour tester sans ouvrir de port, et accès au serveur HTTP (`fastify.server`) pour y attacher Socket.IO.
4. **Autre langage** (Go, Python) : obligerait à dupliquer les contrats entre le client TypeScript et le serveur.

## Décision

**Node 22 + TypeScript strict + Fastify 5.** Critères : validation des entrées et format d'erreur unique sans code supplémentaire, logs JSON corrélés par requête, testabilité (`inject`), et un seul langage avec le client pour partager les contrats (ADR-0005).

## Conséquences

- Chaque route déclare ses schémas de requête et de réponse (TypeBox, ADR-0005). Fastify rejette les entrées invalides avant le handler et filtre les réponses (pas de fuite de champ non déclaré).
- Un gestionnaire d'erreurs unique convertit toute erreur au format `{ error: { code, message, requestId } }`, avec une correspondance statut → code (architecture § 5.1, #60).
- Les tests d'API utilisent `app.inject` contre une vraie base jetable ; les tests temps réel démarrent de vraies instances sur des ports libres.
- Exécution TypeScript : `tsx` en développement, bundle `tsup` en production (un seul `dist/server.js` qui embarque `packages/shared`). Pas d'étape de compilation séparée pour le paquet partagé.
- Fastify est moins répandu qu'Express : certains exemples et middlewares Express ne s'appliquent pas directement (il faut un plugin Fastify équivalent).
