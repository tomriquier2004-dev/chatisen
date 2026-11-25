# ADR-0009 : WebRTC P2P et coturn pour les appels audio/vidéo 1-1

- **Statut** : proposé
- **Date** : 2026-11-25
- **Auteur (domaine)** : Mathys (appels)
- **Relecteur (autre domaine)** : Theo (messagerie)
- **Exigences concernées** : FR-09, FR-10, FR-11, FR-13, NFR-01, NFR-02, NFR-03, NFR-04, NFR-06, NFR-07

## Contexte

Le périmètre fonctionnel actuel comprend les appels audio et vidéo entre deux utilisateurs, ainsi que le contrôle du microphone et de la caméra. L'application doit permettre à deux clients de négocier une connexion malgré les contraintes fréquentes de NAT et de pare-feu, tout en limitant le coût d'infrastructure et en protégeant la confidentialité des flux.

L'architecture dispose de Socket.IO pour les échanges temps réel (voir ADR-0004). Ce canal peut transporter la signalisation nécessaire à WebRTC, mais ne doit pas transporter les médias audio et vidéo. Le périmètre actuel ne comprend pas les conférences multi-participants ni le partage d'écran.

À la date de rédaction, l'API Socket.IO est implémentée pour les usages temps réel de la messagerie. La présente décision décrit l'architecture proposée pour les appels ; elle ne signifie pas que WebRTC ou coturn sont déjà intégrés au produit.

## Options considérées

1. **WebRTC P2P sans serveur TURN** — les clients établissent directement une connexion lorsque la configuration réseau le permet ; solution simple et peu coûteuse en infrastructure, mais certains réseaux (NAT symétrique, pare-feu restrictif) empêchent l'établissement de la connexion.
2. **WebRTC P2P avec STUN et coturn (TURN de secours)** — les clients tentent une connexion directe et utilisent un relais TURN lorsque les candidats directs ne permettent pas de communiquer ; compromis entre qualité, couverture réseau et coût, au prix d'une infrastructure TURN et de sa bande passante.
3. **SFU ou relais média systématique** — les médias transitent par un serveur spécialisé ; facilite certaines évolutions (notamment les conférences), mais ajoute des coûts d'exploitation et de complexité qui ne sont pas justifiés par le périmètre actuel des appels 1-1.

## Décision

Nous proposons **WebRTC en pair-à-pair (P2P) pour les flux audio et vidéo 1-1**, avec **Socket.IO pour la signalisation** et **coturn comme service TURN de relais lorsque la connexion directe échoue**.

Le déroulement attendu est le suivant :

1. Un utilisateur initie ou rejoint un appel. Le serveur vérifie que les participants sont autorisés à prendre part à cet appel.
2. Les clients échangent via Socket.IO les messages de signalisation nécessaires à la négociation WebRTC : description de session (offre/réponse) et candidats ICE. Les payloads sont validés côté serveur et les événements sont réservés aux participants autorisés.
3. Les clients utilisent les mécanismes ICE et un serveur STUN pour découvrir les possibilités de connectivité et tenter d'établir une connexion directe.
4. Si aucun chemin direct utilisable n'est trouvé, les clients peuvent utiliser coturn comme relais TURN. Le trafic média transite alors par le relais, sans être déchiffré par celui-ci.
5. Les flux audio/vidéo sont transportés par WebRTC et protégés par DTLS-SRTP. Le serveur applicatif et Socket.IO ne relaient pas les médias dans le fonctionnement nominal.

### Identifiants TURN et sécurité

- Les identifiants TURN fournis aux clients doivent être temporaires, à durée de validité courte et générés ou signés côté serveur à partir d'un secret partagé avec coturn (mécanisme d'identifiants TURN temporaires, par exemple `use-auth-secret`).
- Le secret partagé ne doit jamais être exposé au client. Les identifiants temporaires sont délivrés uniquement après authentification et contrôle de l'accès à l'appel.
- Le serveur vérifie les droits des participants pour chaque action de signalisation pertinente. Il ne doit pas se fier à un identifiant d'appel fourni par le client sans vérifier l'appartenance à cet appel.
- DTLS-SRTP protège les médias en transit, y compris lorsqu'ils sont relayés par TURN. Le relais observe des métadonnées nécessaires à l'acheminement (adresses, ports, volumes et temporalité du trafic), mais n'accède pas au contenu média en clair.

### Périmètre

Cette décision couvre les appels audio et vidéo entre deux participants ainsi que les contrôles microphone/caméra associés. Les conférences multi-participants (FR-12) et le partage d'écran (FR-15) restent hors périmètre ou suspendus pour la version actuelle. Une évolution vers un SFU pourra faire l'objet d'un ADR distinct si ces besoins deviennent prioritaires.

Le feedback de qualité (FR-13) est un objectif avancé : les clients pourront exploiter les statistiques WebRTC disponibles via `getStats()` et des métriques d'appel pour observer la qualité. Cette décision ne présume pas que la collecte, l'affichage ou l'alerting correspondants sont déjà implémentés.

Les détails de ports, de règles réseau et d'intégration au reverse proxy ne sont pas définis ici ; ils sont traités dans l'issue #8 et la documentation opérationnelle associée.

## Conséquences

### Bénéfices

- Les médias circulent directement entre les deux clients lorsque le réseau le permet, sans mobiliser la bande passante du serveur applicatif.
- TURN améliore la connectivité dans les environnements où une liaison directe est impossible.
- La signalisation reste intégrée au canal temps réel existant, avec authentification, validation et contrôle d'accès côté serveur.
- Le chiffrement DTLS-SRTP protège le contenu média en transit, y compris sur un chemin relayé.

### Coûts et limites

- coturn doit être déployé, supervisé, mis à jour et protégé contre les usages abusifs. Les identifiants temporaires, les limites de ressources et les règles d'accès doivent être configurés correctement.
- Un appel relayé consomme de la bande passante TURN, potentiellement dans les deux sens. Le coût dépendra de la proportion d'appels relayés, de leur durée et de la qualité des médias.
- coturn constitue une dépendance de disponibilité pour les utilisateurs dont le réseau nécessite un relais. Si TURN est indisponible, les connexions directes peuvent toujours fonctionner, mais les appels nécessitant le relais échoueront.
- La qualité P2P dépend des conditions réseau des participants ; le relais peut augmenter la latence et la consommation de bande passante.
- La signalisation Socket.IO doit gérer les interruptions, les états d'appel et les négociations échouées sans considérer qu'un ACK équivaut à un appel établi.
- L'observabilité devra distinguer les connexions directes des connexions relayées et suivre les échecs de négociation, la durée des appels et les statistiques WebRTC pertinentes.
- Les conférences et le partage d'écran nécessiteraient une réévaluation de l'architecture ; un SFU pourrait alors devenir préférable à une topologie P2P en maillage.
- Les objectifs chiffrés de qualité, de disponibilité et de capacité devront être définis à partir de mesures en environnement représentatif.
