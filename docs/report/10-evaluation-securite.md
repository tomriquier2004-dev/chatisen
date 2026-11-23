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
