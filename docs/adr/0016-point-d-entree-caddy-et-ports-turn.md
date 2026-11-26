# ADR-0016 : Point d'entrée Caddy, un seul nom d'hôte, ports de coturn

- **Statut** : proposé
- **Date** : 2026-11-25
- **Auteur (domaine)** : Sha (infra)
- **Relecteurs (autres domaines)** : Tom (Flex), Mathys (appels, pour la partie coturn)
- **Exigences concernées** : NFR-04, NFR-07, NFR-03 ; FR-09, FR-10

> Numéro 0016 : le 0015 est réservé à l'ADR « Seuils de blocage du pipeline de sécurité » (Tom). Cet ADR traite l'issue #8 (port TURN et reverse proxy) ; il ne la clôt pas tant que coturn n'est pas déployé et testé depuis la salle de démo.

## Contexte

- [`architecture.md`](../architecture.md) § 8.1 propose **Caddy** (ou Nginx) comme point d'entrée : terminaison TLS, service du build statique, reverse proxy vers l'API. Le § 6.4 prévoyait aussi coturn en TLS sur le **443**, port que Caddy occupe déjà sur la même VM (issue #8).
- Le prof a fourni un seul nom, `dc-ops.isen.fedyna.fr`, et crée les sous-domaines **un par un** à la demande. L'adresse IP publique de la VM est une IP statique GCP ([ADR-0012](0012-deploiement-et-hebergement.md)).
- Le code suppose déjà **une seule origine** : le client appelle `/api` et `/socket.io` ; le cookie de refresh est limité au chemin `/api/v1/auth` ; le proxy de développement de Vite fait le même routage.
- Le pare-feu GCP n'ouvre que 80 et 443 (TCP) pour le web, et 3478 (UDP/TCP), 5349 (TCP) et 49152-49252 (UDP) pour coturn.

## Options considérées

**Point d'entrée**

1. **Caddy** — HTTPS automatique (Let's Encrypt), configuration courte, WebSocket sans réglage, image officielle légère. Moins répandu que Nginx.
2. **Traefik** — découverte par étiquettes Docker, utile avec beaucoup de services ; configuration plus lourde que nécessaire pour trois routes.
3. **Nginx + certbot** — très répandu ; deux composants à synchroniser pour les certificats.

**Noms d'hôte**

A. **Un seul nom, routage par chemin** — une seule modification DNS demandée au prof, un certificat, même origine pour le client et l'API (pas de CORS, cookie `SameSite=Strict`).
B. **Un sous-domaine par service** (`api.`, `turn.`, `grafana.`) — séparation d'origine, mais quatre demandes au prof et un certificat par nom.

**coturn et le port 443**

- **Seconde IP publique dédiée à coturn** — résout le conflit, coûte une IP de plus et une règle de pare-feu.
- **Routage par SNI devant Caddy et coturn** — complexité élevée pour un gain limité.
- **Se contenter de 3478 et 5349**, et mesurer depuis le réseau cible la part d'appels qui échouent.

## Décision

1. **Caddy**, image officielle épinglée sur un tag de version exacte (`2.11.9-alpine`). La surveillance de ses mises à jour par Dependabot Docker n'est pas encore en place (issue #43).
2. **Un seul nom d'hôte** : `dc-ops.isen.fedyna.fr`. `/api/*` et `/socket.io/*` vont vers l'API (`api:3000`, réseau interne Docker) ; le reste est servi depuis le build statique du client. **Aucun sous-domaine.** La seule demande au prof est de faire pointer ce nom (enregistrement A, TTL 15 min) vers l'IP statique.
3. **Caddy n'expose que 80 et 443 en TCP.** HTTP/3 est désactivé, car l'UDP 443 n'est pas ouvert. En-têtes de base : HSTS à 1 jour au départ, `nosniff`, `Referrer-Policy`. La politique CSP reste à définir par le propriétaire du client, hors de ce lot.
4. **Grafana, Prometheus et Loki ne sont pas exposés à Internet.** Ils écoutent sur `127.0.0.1` ; l'accès se fait par tunnel SSH. La route `/grafana` prévue au § 8.1 de l'architecture est abandonnée.
5. **coturn** : 3478 en UDP et TCP, plage de relais UDP **49152-49252** (alignée sur le pare-feu ; le § 8.1 indique 49152-49200). **Pas de TURN sur le 443.** Le TLS sur 5349 n'est pas retenu pour la première version : il n'apporterait un bénéfice que sur des réseaux restrictifs et exigerait de partager le certificat de Caddy avec coturn. Le port 5349 reste ouvert au pare-feu mais sans service ; il sera refermé si on ne l'utilise pas. **Vue J1** : coturn tourne sur la même VM et la même IP que Caddy. **Vue cible** : une VM TURN séparée derrière le load balancer est envisagée (consigne du prof, à confirmer avec Tom : [`architecture.md`](../architecture.md) § 8.3) ; l'[ADR-0019](0019-coturn-vm-dediee.md) consignera ce changement.
6. **Caddy ne démarre avec le nom de domaine qu'une fois le DNS résolu vers la VM**, pour ne pas épuiser les limites de validation échouée de Let's Encrypt.
7. **Test préalable sans application** : `infra/compose/compose.ports-test.yml` et `infra/caddy/Caddyfile.ports-test` servent à prouver l'ouverture et la fermeture des ports, ainsi que le chiffrement sur 443, avant tout déploiement ([`infra/README.md`](../../infra/README.md)).

## Conséquences

- **Risque R4 maintenu** : un réseau qui ne laisse passer que le 443 bloquera les appels qui ont besoin du relais TURN. Ce risque est **mesuré** depuis le réseau de la salle de démo (question encore ouverte pour le prof). Si le blocage est avéré, les options restantes sont la seconde IP dédiée ou le routage par SNI.
- **Sans TLS sur coturn**, les messages TURN ne sont pas chiffrés ; le média WebRTC l'est toujours (DTLS-SRTP). Cette limite est à énoncer dans le rapport de sécurité.
- **Même origine pour le client et l'API** : plus simple et plus sûr côté cookies, mais une faille XSS dans le client atteindrait l'API avec les mêmes privilèges de navigateur ; la CSP et l'échappement par défaut de Preact en sont la protection.
- **Let's Encrypt** demande que le port 80 soit joignable et que la VM soit allumée pour émettre et renouveler le certificat. La durée de validité d'un certificat Let's Encrypt est de l'ordre de plusieurs semaines (à vérifier à l'émission) ; Caddy renouvelle seul et retente si le renouvellement tombe pendant l'arrêt nocturne.
- **Adresse du client derrière le proxy** : sans configuration, l'API voit l'IP de Caddy, et la limitation de débit (issue #71) traiterait tous les utilisateurs comme un seul. `TRUST_PROXY` doit être activé dans la configuration de déploiement de l'API (à vérifier par le domaine messagerie).
- **Documentation alignée** : `architecture.md` §§ 6.4, 8.1 et 8.3 ont été mis à jour (PR #126 et #130) : retrait du TLS 443, route `/grafana` abandonnée, plage 49152-49252, vues J1 et cible.
- **À revoir** si la salle de démo bloque TURN, si le prof impose des sous-domaines, ou si plusieurs instances de l'API exigent un affinage de routage (sticky sessions, ADR-0011).

## À vérifier avant de passer à « accepté »

Preuves de la séance du 25/11/2026 : [`docs/reports/ports-tls-2026-11-25.md`](../reports/ports-tls-2026-11-25.md).

- [x] Caddyfile **de test** chargé par Caddy sur la VM, qui répond en HTTPS (la sortie de `caddy validate` n'a pas été conservée).
- [x] Caddyfile **de production** validé : Caddy le charge sur la VM avec l'API et le client déployés (rapport du 2026-11-26).
- [x] Port 443 joignable depuis l'extérieur.
- [x] Port 80 joignable depuis l'extérieur : redirection `308` vers HTTPS (rapport du 2026-11-26).
- [x] 3389, 5432, 6379, 3000 et 9090 injoignables (contrôle positif : `github.com:22` répond depuis le même poste ; rapport `ssh-iap-et-rollback-2026-11-26`), **depuis un réseau qui laisse sortir ces ports** : un réseau local restrictif donne des délais dépassés qui ne prouvent rien sur le pare-feu GCP.
- [x] Nom `dc-ops.isen.fedyna.fr` redirigé par le prof vers l'IP de la VM (résolution vérifiée par `nslookup` via 8.8.8.8 et par `curl`).
- [x] Certificat valide obtenu pour ce nom (accepté sans `-k` par `curl`).
- [x] Émetteur du certificat relevé : Let's Encrypt, `CN=YE2` (rapport du 2026-11-26 ; Caddy peut aussi utiliser ZeroSSL, ce n'est pas le cas ici).
- [ ] coturn déployé et TURN testé depuis le réseau de la salle de démo.
- [x] `architecture.md` mis à jour (§§ 6.4, 8.1 et 8.3, PR #126 et #130).
