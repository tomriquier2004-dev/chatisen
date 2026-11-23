# Rapport : tests de bout en bout de la messagerie (Playwright)

> Issue #81 · FR-01, FR-05, FR-17, NFR-03 · Livrable 4 (Tests) · Code : [`apps/web/e2e/`](../../apps/web/e2e/)

## Objectif

Valider, dans de vrais navigateurs, les parcours que les tests d'API et de temps réel ne couvrent pas : l'interface, la session dans le navigateur, et la fiabilité ressentie par l'utilisateur lors d'une coupure réseau.

## Méthodologie

- **Pile complète** démarrée par Playwright (`apps/web/playwright.config.ts`) : l'API (`tsx src/server.ts`, port 3100) sur un vrai PostgreSQL 16 et un vrai Redis 7, et le client Vite (port 5174) qui relaie `/api` et `/socket.io` vers cette API. Clé JWT jetable à chaque lancement, limitation de débit désactivée (elle est testée côté API, #86).
- **Deux personnes = deux contextes Chromium** (cookies, stockage et socket séparés), pilotés en parallèle dans le même test.
- **Coupure réseau** : les connexions WebSocket de la seconde personne passent par un relais Playwright (`page.routeWebSocket`). La coupure ferme la socket et refuse les reconnexions ; le rétablissement les autorise à nouveau. Le mode hors ligne de Chromium n'a pas été retenu, car il ne ferme pas toujours une WebSocket déjà ouverte.
- **Données** : comptes au nom unique à chaque test, sur la base de développement (local) ou sur les services de la CI. Tests en série (1 worker).
- **CI** : workflow `.github/workflows/e2e.yml`, sur chaque PR qui touche `apps/`, `packages/` ou le lockfile. Le rapport HTML est publié en artefact si un test échoue.

## Scénarios et résultats

| # | Scénario | Ce qui est vérifié | Résultat |
| --- | --- | --- | --- |
| 1 | Inscription, déconnexion, reconnexion | Inscription par l'interface, déconnexion, connexion ; la session survit à un rechargement (cookie httpOnly) | ✅ |
| 2 | Message en direct entre deux navigateurs | Alice crée une conversation privée ; elle **apparaît chez Bob sans rechargement** ; un message envoyé de chaque côté est reçu en direct de l'autre | ✅ |
| 3 | **Fiabilité : coupure réseau** | Bob perd sa connexion temps réel (bandeau « Connexion perdue ») ; Alice envoie 3 messages ; au rétablissement, Bob reçoit les messages manqués **dans l'ordre et sans doublon** (liste exacte vérifiée) | ✅ |
| 4 | **Accès : membre retiré** | Le propriétaire retire Bob d'un groupe ; chez Bob, la vue se ferme avec « Vous avez été retiré de … » et la conversation disparaît, **sans rechargement** ; le message envoyé ensuite ne lui parvient pas | ✅ |

Exécution locale du 2026-11-23 (Windows 11, Chromium de Playwright 1.65.1, Postgres et Redis en conteneurs) :
- 4 tests réussis en 18,7 s ;
- **`--repeat-each=3` : 12 sur 12 réussis** (37,1 s), sans instabilité observée.

L'exécution en CI figure dans les checks de la PR.

## Limites

- **Un seul navigateur** (Chromium). Firefox et WebKit ne sont pas testés.
- **Réseau simulé** : la coupure porte sur la connexion temps réel seulement (le REST reste joignable), et elle est franche. Pas de latence, de perte de paquets partielle ni de bascule entre réseaux (`tc netem` est prévu dans les tests de fiabilité de l'infra).
- **Pas de charge** : deux utilisateurs à la fois. La tenue en charge relève des tests k6 (#24).
- **Une seule instance d'API** : la diffusion entre instances (adapter Redis) est couverte par les tests d'intégration de l'API (`realtime.test.ts`, `live-rooms.test.ts`), pas ici.
- La coupure attend la reconnexion automatique de Socket.IO (jusqu'à quelques secondes) ; le scénario tolère 20 s.
