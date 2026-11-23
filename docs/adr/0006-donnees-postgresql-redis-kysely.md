# ADR-0006 : Données avec PostgreSQL, Redis et Kysely

- **Statut** : proposé
- **Date** : 2026-11-23
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : Sha (infra), qui exploite les bases
- **Exigences concernées** : FR-07, FR-08, FR-17, FR-18, NFR-02, NFR-03, NFR-07

## Contexte

Les données de la messagerie sont relationnelles : utilisateurs, sessions, conversations, appartenances avec rôle, messages ordonnés (architecture § 4). Il faut des contraintes fortes (unicité de `seq` et de `client_msg_id` par conversation, une seule conversation privée par paire) et des transactions. Plusieurs instances d'API doivent aussi partager un état éphémère : diffusion Socket.IO entre instances, compteurs de limitation de débit. Enfin, l'accès à la base depuis TypeScript doit être typé, et les migrations versionnées.

## Options considérées

**Base durable**
1. **PostgreSQL 16** : contraintes, transactions, `citext`, `ON CONFLICT`, outils de sauvegarde maîtrisés (`pg_dump`, #31).
2. **MongoDB** : pas de jointures ni de contraintes d'unicité composées aussi simples, alors que le modèle est relationnel.
3. **SQLite** : très simple, mais un seul écrivain et pas de partage entre plusieurs instances d'API.

**État partagé entre instances**
1. **Redis 7** : adapter officiel Socket.IO, compteurs atomiques (scripts Lua), rien de durable à sauvegarder.
2. **PostgreSQL** (`LISTEN/NOTIFY`, table de compteurs) : une dépendance de moins, mais charge d'écriture sur la base principale et adapter Socket.IO moins utilisé.

**Accès à la base**
1. **Kysely + `pg`** : constructeur de requêtes typé, sans génération de code ni DSL de schéma, migrateur intégré ; le SQL reste lisible et maîtrisé.
2. **Drizzle ORM** : typé aussi, schéma déclaré en TypeScript, migrations générées. Plus « magique », et l'outil de migration (drizzle-kit) est une dépendance de plus.
3. **Prisma** : génération de client, moteur séparé, abstraction plus éloignée du SQL (par exemple pour `UPDATE … RETURNING` dans une transaction).
4. **SQL brut avec `pg`** : contrôle total, mais aucun typage des résultats.

## Décision

- **PostgreSQL 16** pour toutes les données durables ; **Redis 7** pour l'état partagé et éphémère (adapter Socket.IO, limitation de débit). Redis ne contient rien qu'on ne puisse perdre (architecture § 10.2).
- **Kysely + `pg`** pour l'accès typé. Les types des tables sont écrits à la main (`apps/api/src/db/schema.ts`) en miroir des migrations.
- **Migrations versionnées dans le code** (`0001_initial_schema.ts`…), appliquées **au démarrage de l'API** sous le verrou du migrateur Kysely (plusieurs instances peuvent démarrer ensemble). Elles sont déclarées dans le code pour être incluses dans le bundle `tsup`.

## Conséquences

- Les règles d'intégrité sont dans la base (contraintes `UNIQUE`, `CHECK`, clés étrangères), pas seulement dans le code. Elles sont testées contre un vrai PostgreSQL (`schema.test.ts`), avec une base jetable par fichier de test, en local (`pnpm db:up`) comme en CI (services Postgres et Redis).
- Les types de `schema.ts` peuvent dériver des migrations : une colonne ajoutée dans une migration doit être reportée à la main. À surveiller en revue (ou passer à `kysely-codegen` si le schéma grossit).
- `bigint` (`seq`, `last_seq`) est lu en `number` JS, ce qui est sûr jusqu'à 2^53.
- Migrer au démarrage est simple tant qu'il n'y a qu'un déploiement à la fois. Pour une migration longue ou destructive, il faudra une étape séparée du pipeline (à voir avec #12).
- Sans Redis, l'API fonctionne en **instance unique** (compteurs en mémoire, pas d'adapter). Dès deux instances, `REDIS_URL` est obligatoire.
- Deux services à exploiter et à surveiller au lieu d'un. La sauvegarde ne concerne que PostgreSQL (#31).
