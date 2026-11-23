# 10. Évaluation de sécurité

> Statut : 🔴 à écrire

## Ce que ce chapitre doit établir

- Modèle de menaces (STRIDE) et exigences de sécurité numérotées (`SEC-xx`)
- Protections implémentées, **démontrées fonctionnelles**
- Faiblesses identifiées **et testées**, résultats documentés
- **Limites énoncées**

## Contenu

_À rédiger._

## Limitation de débit (issue #71)

> Code : [`apps/api/src/plugins/rate-limit.ts`](../../apps/api/src/plugins/rate-limit.ts) · tests : `rate-limit.test.ts`

Menaces visées : brute force sur un compte, attaque par pulvérisation (un mot de passe sur beaucoup de comptes), déni de service par le coût d'Argon2id (~19 MiB et du CPU par inscription ou connexion), parcours de l'annuaire par la recherche d'utilisateurs.

| Route | Règle | Seuil de départ |
| --- | --- | --- |
| `POST /auth/login` | par adresse IP | 20 / minute |
| `POST /auth/login` | par compte (nom d'utilisateur, sans casse) | 10 / 15 minutes |
| `POST /auth/register` | par adresse IP | 10 / heure |
| `POST /auth/refresh` | par adresse IP | 60 / minute |
| `GET /users?query=` | par utilisateur connecté | 30 / minute |

- Dépassement : `429` avec le code `RATE_LIMITED` et l'en-tête `Retry-After`. La limite est vérifiée **avant** le hachage Argon2id : une requête refusée ne coûte presque rien.
- Compteurs en fenêtre fixe dans **Redis** (script Lua atomique), partagés entre les instances d'API. En mémoire quand l'API tourne sans Redis.
- Démontré par les tests automatisés : blocage d'un compte depuis des adresses différentes, blocage d'une adresse sur des comptes différents, inscription, recherche, compteurs partagés entre deux clients Redis et expiration de la fenêtre.

**Limites**
- Les seuils sont des valeurs de départ, **pas encore calibrées par une mesure** (axes sécurité #27 et performance #24).
- **Adresses partagées** : derrière un NAT (réseau de l'école), plusieurs personnes partagent la même adresse et donc le même compteur.
- **Proxy** : derrière Caddy, il faut `TRUST_PROXY=true` pour compter l'adresse réelle du client. Sans proxy, l'activer laisserait un client choisir l'adresse comptée via `X-Forwarded-For`.
- **Verrouillage par un tiers** : la limite par compte permet à quelqu'un de bloquer la connexion d'un autre pendant 15 minutes en tentant de mauvais mots de passe. C'est le compromis classique face au brute force.
- La fenêtre fixe autorise jusqu'à deux fois la limite à cheval sur deux fenêtres.

### Temps réel (issue #88)

| Cible | Règle | Seuil de départ |
| --- | --- | --- |
| `message:send` | par utilisateur, toutes sockets et instances confondues | 20 / 10 secondes |
| Connexions Socket.IO | simultanées par utilisateur, toutes instances confondues | 10 |

- `message:send` au-delà de la limite : ack `{ ok: false, error: { code: "RATE_LIMITED" } }`. La vérification a lieu **avant** le contrôle d'appartenance et toute écriture : ni transaction, ni verrou de conversation.
- Connexion de trop : refusée au handshake (`connect_error` « RATE_LIMITED »). Le décompte passe par l'adapter Redis (`fetchSockets` sur la room `user:<id>`), donc il couvre toutes les instances.
- Démontré par `socket-rate-limit.test.ts`, avec deux instances d'API et des compteurs Redis communs : le 21e message est refusé alors que les envois étaient répartis sur deux instances, et la base contient exactement 20 messages. La 11e connexion est refusée puis acceptée quand une place se libère, sans effet sur les autres utilisateurs.

### Redis indisponible : décision

Les compteurs passent par un `FallbackRateLimiter` : si Redis ne répond pas, chaque instance **bascule sur des compteurs en mémoire**. Le client Redis du limiteur est en `disableOfflineQueue`, pour qu'une commande échoue tout de suite au lieu d'attendre la reconnexion.

- Pourquoi : **tout refuser** rendrait la connexion et la messagerie inutilisables pendant une panne de Redis, ce qui contredit NFR-03. **Tout laisser passer** supprimerait la protection contre le brute force au moment où l'on est déjà en mode dégradé.
- Vérifié à la main (bundle de l'API, Redis arrêté) : les connexions répondent en environ 0,3 s avec la bascule journalisée, et `/health/ready` répond 503 `redis: down` en environ 1 s. Avant ce correctif, la sonde ne répondait plus, car le ping Redis attendait la reconnexion.
- **Limite** : pendant la panne, les limites s'appliquent **par instance**. Avec N instances, un attaquant peut obtenir jusqu'à N fois la limite. Le plafond de connexions dépend aussi de l'adapter Redis : pendant la panne, il ne voit que les sockets de l'instance locale.

**Limites (temps réel)**
- Seuils non mesurés, à calibrer avec les tests de charge (#24). 20 messages en 10 s couvre une conversation animée, mais pas un collage massif de lignes.
- Les autres événements (`conversation:sync`, `message:read`) ne sont pas limités : ils ne font que lire, ou une écriture bornée par utilisateur.
