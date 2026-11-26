# ADR-0023 : Monolithe modulaire, puis architecture hexagonale par module

- **Statut** : proposé
- **Date** : 2026-11-26
- **Auteur (domaine)** : Sha (infra), rédigé pour le back
- **Relecteur (autre domaine)** : Theo (messagerie) et Mathys (appels), à confirmer
- **Exigences concernées** : NFR-02, NFR-03, NFR-05, NFR-07 ; FR-05, FR-09 à FR-13
- **Consigne** : C7 ([`prof-qa.md`](../prof-qa.md))
- **Détail du découpage, des interfaces et des diagrammes** : [`architecture.md` § 13](../architecture.md#13-découpage-en-modules-monolithe-modulaire)

## Contexte

- L'encadrant demande de **définir et justifier** le découpage de l'application en micro-services ou en monolithe modulaire, puis, pour chaque module, de donner ses interfaces (OpenAPI 3.0), sa décomposition en **architecture hexagonale** et ses interfaces avec les autres modules. Un cours sur l'hexagonale est à venir : on pose d'abord les modules et leurs interfaces.
- Le code est déjà organisé en modules dans `apps/api/src/modules/` (`auth`, `users`, `conversations`, `messages`, `calls`, `turn`), avec une couche temps réel transverse (`apps/api/src/realtime/`) et des plugins transverses (`plugins/`). Ils sont déployés dans **un seul conteneur** `api`.
- Contraintes du projet : équipe de quatre, soutenance le 11 décembre, une VM (puis une VM TURN séparée en cible, [ADR-0019](0019-coturn-vm-dediee.md)), un budget cloud de quelques centaines d'euros, et un projet noté sur la **justification** et la **mesure** des choix d'infrastructure, de CI/CD et d'exploitation.
- La scalabilité est une fonctionnalité avancée : elle n'est pas prioritaire (consigne C7).

## Options considérées

1. **Monolithe non structuré** : tout dans un même code, sans frontières. Le plus rapide à écrire, mais les dépendances se mélangent, ce qui rend difficile les tests, la relecture et un éventuel découpage ultérieur.
2. **Monolithe modulaire** : un seul déploiement, découpé en modules par domaine, chacun exposant une interface publique (ses ports) et cachant son intérieur ; aucun module n'accède aux tables ni au code interne d'un autre.
3. **Micro-services** : un service par domaine (authentification, conversations et messages, appels), chacun avec sa base, son image, son pipeline et son déploiement.

## Décision

**Option 2 : un monolithe modulaire**, avec une évolution progressive vers l'architecture hexagonale à l'intérieur de chaque module.

Pourquoi pas les micro-services pour ce projet :

- **Cohérence transactionnelle** : l'envoi d'un message attribue `seq`, vérifie l'appartenance et écrit en une seule transaction PostgreSQL ([ADR-0008](0008-ordre-idempotence-messages.md)). Éclater messages, conversations et utilisateurs en services séparés remplacerait cette transaction par des échanges réseau et de la cohérence à terme, sans bénéfice pour le besoin.
- **Temps réel partagé** : les rooms Socket.IO (`conv:*`, `user:*`) suivent l'appartenance en base et sont relayées entre instances par Redis ([`architecture.md` § 5.3](../architecture.md)). Plusieurs services devraient partager cet état ou se le répéter.
- **Coût d'exploitation, qui est ce qui est noté** : chaque service ajoute une image à construire, scanner (Trivy) et publier, un pipeline, des variables, des sondes, des flux réseau à justifier et à prouver (pare-feu, TLS), et une couche d'observabilité. Pour quatre personnes en trois semaines, cela consommerait le temps nécessaire aux mesures (charge, sécurité, restauration).
- **Un seul artefact à déployer et à restaurer** : une image `api`, un déploiement, un retour arrière ([ADR-0022](0022-registre-ghcr-et-deploiement-manuel-j1.md)).
- **La séparation utile existe déjà là où elle apporte quelque chose** : coturn est un service distinct, sur sa propre VM en cible ([ADR-0019](0019-coturn-vm-dediee.md)), car son profil de charge et de risque diffère.

Règles du monolithe modulaire :

1. Un module expose une **interface publique** (ses ports : fonctions ou interfaces TypeScript) et cache son intérieur.
2. Un module **n'accède ni aux tables ni au code interne** d'un autre : il passe par ses ports.
3. Les contrats (DTO REST, événements Socket.IO) restent dans `packages/shared` ; la spécification **OpenAPI 3.0** de chaque module est générée à partir du code (`pnpm --filter @chatisen/api openapi`).
4. Hexagonale, **après le cours** : le domaine d'un module ne dépend ni de Fastify, ni de PostgreSQL/Kysely, ni de Redis, ni de Socket.IO ; ces éléments deviennent des adaptateurs branchés sur des ports. Trois ports existent déjà dans le code (`MembershipEvents`, `SessionEvents`, `MicrosoftClient`) ainsi que `RateLimiter`.

## Conséquences

- **L'état actuel n'est pas encore hexagonal.** Les services reçoivent directement le client Kysely, et le code contient des entorses aux règles 1 et 2 relevées dans [`architecture.md` § 13.2](../architecture.md#132-interfaces-entre-modules) (par exemple `calls` lit la table `conversations`, la recherche d'utilisateurs est dans `conversations`, `users` importe `toMe` depuis `auth`). Ce sont des écarts à corriger, pas des choix.
- **Le découpage n'est pas imposé par un outil.** Pour que les règles ne dérivent pas, une règle ESLint `no-restricted-imports` entre modules est à proposer dans une PR séparée (ce n'est pas une nouvelle dépendance).
- **La scalabilité horizontale reste possible** en dupliquant le monolithe derrière un même Redis (adapter Socket.IO), ce que teste déjà la suite `live-rooms.test.ts` sur deux instances. Le choix entre sessions collantes et WebSocket seul (ADR-0011) reste ouvert.
- **Le découpage en services est reporté, pas exclu.** Candidat naturel : la signalisation des appels, si la charge de test (k6, #24) montre qu'elle limite le reste. Les ports entre modules sont ce qui le rendrait possible.
- **Limites** : cette décision est argumentée, pas mesurée. Aucune mesure ne compare un monolithe et plusieurs services sur ce projet. À revoir si les tests de charge montrent un goulot localisé dans un module, ou si le périmètre fonctionnel s'élargit fortement (extensions, conférences).
