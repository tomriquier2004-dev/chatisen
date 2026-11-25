# ADR-0004 : Temps réel et signalisation avec Socket.IO

- **Statut** : proposé
- **Date** : 2026-11-25
- **Auteur (domaine)** : co-rédaction Messagerie (Theo) et Appels (Mathys)
- **Relecteur (autre domaine)** : à confirmer
- **Exigences concernées** : FR-05, FR-16, FR-17, FR-18, FR-09, FR-10, NFR-01, NFR-02, NFR-03, NFR-04, NFR-05

## Contexte

L'API doit diffuser les messages et les événements de présence, gérer les rooms liées aux utilisateurs, sessions et conversations, et transporter la signalisation des appels WebRTC (offres SDP, réponses et candidats ICE). Le transport doit fonctionner derrière le point d'entrée HTTP existant, permettre les accusés applicatifs et supporter plusieurs instances d'API.

Le code actuel utilise déjà Socket.IO pour la messagerie : le serveur est attaché à Fastify sur `/socket.io`, vérifie le JWT au handshake, construit les rooms depuis les appartenances en base et peut relayer les événements entre instances avec l'adapter Redis. Les événements de messagerie valident leurs payloads et répondent par un ack applicatif normalisé. **La signalisation WebRTC n'est pas encore implémentée** : son usage de Socket.IO est la décision proposée par cet ADR, pas une fonctionnalité déjà livrée.

## Options considérées

1. **WebSocket natif** — protocole léger et contrôle fin, mais il faut construire et maintenir le routage, les rooms, les accusés, la reconnexion, la validation et l'abstraction multi-instance.
2. **SSE + HTTP** — simple pour pousser des événements serveur vers le client, mais le canal retour reste HTTP et le modèle est moins adapté aux échanges bidirectionnels fréquents de la signalisation.
3. **Socket.IO** — événements bidirectionnels, rooms, acknowledgements, reconnexion côté client et adaptateurs de diffusion. En contrepartie, il ajoute une dépendance et son protocole n'est pas un WebSocket brut.

## Décision

Proposer **Socket.IO comme transport temps réel unique de l'application**, attaché au serveur HTTP Fastify sur `/socket.io`.

- **Authentification** : access token JWT transmis dans les données d'authentification du handshake et vérifié côté serveur. Une socket est déconnectée à l'expiration du token ; le client renouvelle sa session puis se reconnecte.
- **Rooms** : elles sont calculées et rejointes par le serveur depuis l'identité et les appartenances en base. Le client ne choisit jamais librement les rooms. Les rooms `user:<id>`, `session:<id>` et `conv:<id>` servent respectivement aux notifications utilisateur, à la révocation d'une session et aux événements d'une conversation.
- **Autorisation** : chaque événement entrant sensible revérifie les droits en base au moment de son traitement. Appartenir à une room ne constitue pas une autorisation.
- **Contrats** : les payloads sont définis dans `packages/shared` avec TypeBox et validés à la frontière serveur. Les événements client → serveur qui attendent un résultat utilisent un ack applicatif au format commun `{ ok, data }` ou `{ ok, error }`.
- **Multi-instance** : l'adapter Redis relaie les émissions et opérations de rooms entre instances. Sans Redis, le mode instance unique reste possible ; le statut Redis doit être observable.
- **Signalisation WebRTC** : les événements `call:invite`, `call:accept`, `call:reject`, `call:hangup`, `rtc:offer`, `rtc:answer` et `rtc:ice-candidate` sont transportés par Socket.IO après définition de leurs contrats et contrôles d'accès. Les messages SDP et ICE sont relayés aux seuls participants de l'appel. **Les médias audio/vidéo ne transitent pas par Socket.IO** : ils utilisent la connexion WebRTC décrite dans l'ADR-0009.

Le choix du mode de transport en production (polling avec affinité de session, ou WebSocket seul) reste à valider selon le proxy, le nombre d'instances et les tests de déploiement. Il ne doit pas être supposé résolu par cet ADR.

## Conséquences

- Le transport commun évite de maintenir deux systèmes temps réel distincts pour la messagerie et la signalisation.
- Socket.IO ajoute une dépendance et un protocole applicatif ; les clients doivent utiliser le client Socket.IO compatible, pas une WebSocket native.
- Un ack confirme le résultat du handler pendant la connexion ; **il ne constitue ni une persistance ni une garantie de livraison après déconnexion**. Les données durables (notamment les messages) restent en base et sont rattrapées par les mécanismes de synchronisation de l'ADR-0008. Les événements de signalisation expirés ne sont pas rejoués comme des messages.
- L'adapter Redis dépend de la disponibilité de Redis et de son mécanisme pub/sub. Il ne remplace pas une file durable ; une coupure Redis peut interrompre la diffusion inter-instance. Le comportement dégradé doit rester explicite et observable.
- Le transport WebSocket / polling doit être testé derrière Caddy et en multi-instance. Si le polling est conservé, l'affinité des requêtes peut être nécessaire selon la topologie ; ce point reste ouvert.
- Les rooms ne remplacent jamais les contrôles d'accès sur les événements entrants. Les payloads SDP/ICE doivent être bornés en taille et validés, et l'identifiant de destination doit être contrôlé côté serveur pour empêcher l'injection de signalisation à un tiers.
- Cette décision ne tranche pas le transport média, le nombre de participants ni l'architecture de conférence ; voir ADR-0009 pour la limite du P2P mesh.
