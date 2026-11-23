# ADR-0007 : Sessions avec un JWT court et un refresh token rotatif en cookie

- **Statut** : proposé
- **Date** : 2026-11-23
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : Tom (Flex, responsable du livrable sécurité)
- **Exigences concernées** : FR-01, FR-04, FR-17, NFR-04

## Contexte

Il faut authentifier les requêtes REST **et** la connexion Socket.IO, sur plusieurs instances d'API, en limitant les dégâts d'un vol de token (XSS, poste partagé) et sans imposer une reconnexion manuelle toutes les 15 minutes.

## Options considérées

1. **Session serveur + cookie de session** : révocation immédiate, mais chaque requête et chaque handshake consulte la base ou Redis, et le cookie est envoyé à toutes les routes (protection CSRF à ajouter).
2. **JWT long en `localStorage`** : simple, mais lisible par n'importe quel script injecté (XSS) et impossible à révoquer avant son expiration.
3. **JWT court en mémoire + refresh token opaque en cookie `httpOnly`, avec rotation** : le token d'accès se vérifie sans base (adapté aux instances multiples et au handshake Socket.IO), il est invisible pour un script persistant, et le refresh token ne voyage que vers `/api/v1/auth`.

## Décision

Option 3 (architecture § 6.1, PR #64) :

- **Access token** : JWT HS256 de 15 minutes (`sub` = utilisateur, `sid` = session, émetteur et audience vérifiés), gardé **en mémoire** par le client, jamais dans `localStorage`. Clé `JWT_SECRET` partagée par les instances (32 caractères minimum).
- **Refresh token** : 256 bits aléatoires, cookie `httpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` en production. **Seule son empreinte SHA-256 est stockée** (`sessions`).
- **Rotation** : chaque refresh token ne sert qu'une fois (`UPDATE … WHERE revoked_at IS NULL`, sûr face aux requêtes concurrentes).
- **Détection de réutilisation** : présenter un token déjà consommé révoque **toute la famille** de sessions (`family_id`) et ferme leurs sockets (#75).
- **Fenêtre de grâce de 10 s** (#72, PR #84) : un token consommé il y a moins de 10 s est traité comme une course légitime (deux onglets, ou un onglet et une reconnexion). La réponse est 401 sans effacer le cookie et sans révoquer la famille.
- **Côté client** (#77, PR #85) : rafraîchissement à **requête unique**. Les appels d'un onglet partagent la même promesse et un verrou Web Locks sérialise les onglets ; un 401 de la fenêtre de grâce est réessayé une fois.
- **Socket.IO** : JWT vérifié au handshake, déconnexion programmée à son expiration ; le client se reconnecte avec un token rafraîchi.
- **Mots de passe** : Argon2id (`@node-rs/argon2`, paramètres OWASP m=19 MiB, t=2, p=1), comparaison à temps constant même pour un compte inexistant.

## Conséquences

- La vérification d'un access token ne touche pas la base : pas de goulot pour le REST ni pour les reconnexions massives.
- **Limite assumée** : après un logout ou une révocation, un access token reste valide jusqu'à **15 minutes**. Les sockets de la session sont fermées tout de suite (#75), mais un appel REST avec ce token passe encore.
- **Limite assumée** : un XSS peut utiliser le token tant que la page est ouverte (il est en mémoire). La protection contre le XSS reste l'échappement systématique et la CSP (architecture § 9).
- La fenêtre de grâce rend indétectable un rejeu dans les 10 s qui suivent la consommation du token ; l'attaquant n'obtient alors qu'un 401.
- **Limite connue** (#73) : le cookie n'est `Secure` qu'avec `NODE_ENV=production`, et les valeurs de développement (clé JWT aléatoire) s'appliquent sinon. À corriger avant le déploiement.
- Le brute force sur `/auth/*` est freiné par la limitation de débit (#71), pas par le seul coût d'Argon2id.
