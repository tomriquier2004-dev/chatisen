# ADR-0004 : Socket.IO pour le temps réel et la signalisation

- **Statut** : proposé
- **Date** : 2026-11-25
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : Mathys (appels)
- **Exigences concernées** : FR-05, FR-09, FR-10, FR-16, FR-17, FR-18, NFR-01, NFR-02, NFR-03, NFR-04, NFR-05

## Contexte

L'application doit diffuser les nouveaux messages et les événements liés aux conversations en temps réel. Le même canal doit également permettre la signalisation nécessaire à l'établissement des appels WebRTC (échange des offres, réponses et candidats ICE), sans transporter les flux audio ou vidéo.

Le serveur HTTP repose sur Fastify. L'authentification applicative utilise des jetons d'accès JWT et l'architecture doit pouvoir fonctionner sur plusieurs instances API. Les événements temps réel doivent être validés, autorisés et associés à des accusés de réception explicites. La signalisation des appels doit rester séparée du transport des médias.

Le temps réel ne constitue pas la source de vérité des messages : la persistance et la reprise après déconnexion sont traitées par les mécanismes décrits dans l'ADR-0008.

## Options considérées

1. **WebSocket natif** — protocole léger et contrôle fin du transport ; nécessite de définir et maintenir nous-mêmes les conventions d'événements, les accusés de réception, la reconnexion et l'intégration multi-instance.
2. **SSE avec HTTP** — adapté à un flux serveur-vers-client simple ; les échanges client-vers-serveur nécessitent des requêtes HTTP séparées et cette option convient moins aux échanges bidirectionnels fréquents de la signalisation.
3. **Socket.IO** — fournit une abstraction événementielle bidirectionnelle, les accusés de réception, la reconnexion et des adaptateurs permettant la diffusion entre instances ; ajoute une dépendance et un protocole applicatif au-dessus des transports disponibles.

## Décision

Nous proposons **Socket.IO**, attaché au serveur HTTP Fastify sur le chemin `/socket.io`, comme canal de communication temps réel de l'application.

Les règles suivantes encadrent son utilisation :

- **Authentification** : le client transmet son JWT d'accès lors du handshake. Le serveur le vérifie et associe au socket l'identité utilisateur et la session. L'expiration du jeton entraîne la déconnexion ; le client doit obtenir un nouvel access token via le mécanisme de renouvellement existant avant de se reconnecter.
- **Rooms** : les rooms sont construites et rejointes côté serveur, notamment `user:<userId>`, `session:<sessionId>` et `conv:<conversationId>`. Le client ne peut pas s'attribuer librement des rooms.
- **Autorisation** : chaque événement sensible vérifie côté serveur les droits requis sur la conversation ou l'appel. L'appartenance à une room ne remplace pas cette vérification.
- **Contrats** : les payloads entrants sont validés avec les schémas TypeBox partagés. Les événements avec réponse utilisent un ACK normalisé : succès sous la forme `{ ok: true, data }`, échec sous la forme `{ ok: false, error: { code, message, requestId } }`.
- **Persistance et reprise** : un ACK confirme le résultat du traitement de l'événement, mais ne constitue pas à lui seul une garantie de persistance ou de livraison durable. La base de données reste la source de vérité ; la synchronisation après reconnexion s'appuie sur les mécanismes de l'ADR-0008.
- **Multi-instance** : l'adaptateur Redis de Socket.IO est utilisé lorsque plusieurs instances API doivent partager la diffusion et la gestion des rooms. Redis ne remplace pas la persistance métier.
- **Signalisation WebRTC** : Socket.IO transporte les messages de signalisation entre participants autorisés. Les médias audio/vidéo sont échangés via WebRTC et ne transitent pas par Socket.IO dans le fonctionnement nominal.

Le choix entre le transport WebSocket seul et le transport HTTP long-polling avec affinité de session (sticky sessions) reste ouvert. Il devra être arbitré et documenté dans l'ADR-0011, en tenant compte de l'infrastructure de déploiement et des contraintes du proxy.

Cette décision formalise le choix architectural proposé. À la date de rédaction, `apps/api/src/realtime/index.ts` attache Socket.IO au serveur HTTP Fastify sur `/socket.io`, vérifie le JWT au handshake, rejoint les rooms `user:<id>`, `session:<id>` et `conv:<id>` depuis la base, et active l'adapter Redis lorsque `redisUrl` est configuré. Les handlers de messagerie valident les payloads TypeBox et renvoient un ACK applicatif normalisé. Ces éléments décrivent le socle actuellement présent : les événements de signalisation `call:*` / `rtc:*`, les autorisations propres aux participants d'un appel et les appels WebRTC restent à implémenter. La décision ne doit donc pas être interprétée comme une livraison de la fonctionnalité d'appel.

## Conséquences

### Bénéfices

- Une API événementielle bidirectionnelle commune à la messagerie et à la signalisation des appels.
- Des mécanismes intégrés d'ACK et de reconnexion, avec une intégration Redis pour la diffusion multi-instance.
- Des contrats et des contrôles d'accès centralisés côté serveur.

### Coûts et limites

- Dépendance supplémentaire à Socket.IO et nécessité de maintenir une compatibilité cohérente entre client et serveur.
- Redis devient nécessaire pour partager correctement les événements et les rooms entre plusieurs instances API.
- La reconnexion Socket.IO ne garantit pas la récupération de tous les événements manqués : celle-ci dépend de la synchronisation applicative et de la persistance décrites dans l'ADR-0008.
- Les ACK doivent être interprétés comme le résultat du traitement serveur, et non comme une preuve que le destinataire a reçu ou lu l'événement.
- Le choix du transport, l'affinité de session et leurs implications opérationnelles restent à préciser dans l'ADR-0011.
- Les performances et la capacité en charge devront être mesurées sur des scénarios représentatifs avant de fixer des objectifs chiffrés.
