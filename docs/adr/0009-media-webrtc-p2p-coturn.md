# ADR-0009 : Média des appels 1-1 avec WebRTC pair-à-pair et coturn

- **Statut** : proposé
- **Date** : 2026-11-25
- **Auteur (domaine)** : Appels (Mathys)
- **Relecteur (autre domaine)** : Messagerie (Theo)
- **Exigences concernées** : FR-09, FR-10, FR-11, FR-13 (Adv), NFR-01, NFR-03, NFR-04, NFR-06, NFR-07

## Contexte

Le périmètre Core impose les appels audio et vidéo 1-1 ainsi que le contrôle du micro et de la caméra. Les deux navigateurs doivent établir un canal média chiffré malgré les NAT et les pare-feu. Une connexion directe n'est pas possible sur tous les réseaux ; un relais est donc nécessaire comme solution de secours.

Le projet dispose d'une API Fastify et d'un socle Socket.IO pour les événements temps réel. **La signalisation d'appel, la connexion WebRTC, les identifiants TURN et le média relayé ne sont pas encore établis comme implémentés** : cet ADR décrit l'architecture proposée. Le conflit de ports et le point d'entrée réseau de coturn sont traités séparément par l'ADR-0016 et l'issue #8 ; cet ADR ne fixe aucun port.

## Options considérées

1. **WebRTC P2P sans TURN** — faible coût serveur et chemin direct lorsque les candidats ICE le permettent, mais certains couples de réseaux ne peuvent pas établir de connexion directe ; l'appel échoue alors.
2. **WebRTC P2P avec coturn en secours** — conserve le chemin direct quand il fonctionne et utilise un relais TURN lorsque la connectivité directe échoue. Le relais consomme de la bande passante et ajoute une dépendance opérationnelle.
3. **SFU ou relais média systématique** — simplifie l'évolution vers des appels multi-participants et peut réduire le nombre de flux montants des clients, mais ajoute un serveur média, des ressources, de l'exploitation et une complexité hors du besoin Core 1-1.

## Décision

Proposer **WebRTC pair-à-pair pour les appels audio/vidéo 1-1**, avec **coturn comme relais TURN de secours**.

1. **Signalisation** : Socket.IO transporte les événements de cycle de vie de l'appel, les offres/réponses SDP et les candidats ICE (ADR-0004). Le serveur authentifie les sockets, vérifie que l'émetteur et le destinataire sont les deux participants de l'appel, et refuse toute signalisation provenant d'un utilisateur non autorisé. Les payloads sont validés et limités en taille.
2. **Négociation ICE** : les clients utilisent des serveurs STUN pour découvrir les adresses candidates et tentent d'abord une connexion directe. Les serveurs TURN de coturn sont fournis comme candidats de relais ; ICE sélectionne un chemin relayé lorsque les chemins directs ne sont pas utilisables.
3. **Identifiants TURN** : l'API délivre des identifiants temporaires compatibles avec le mécanisme REST de coturn (nom d'utilisateur expirant et mot de passe HMAC calculé avec un secret partagé). Leur durée de validité est courte et configurable. Le secret partagé reste exclusivement côté serveur, dans le gestionnaire de secrets de l'environnement ; il n'est jamais envoyé au client ni commité. Les identifiants ne doivent pas être réutilisés comme identifiants permanents.
4. **Média** : audio et vidéo passent directement entre les deux pairs lorsque possible, sinon par le relais TURN. WebRTC protège les flux média avec DTLS-SRTP ; TURN relaie les paquets chiffrés et n'a pas accès au contenu audio/vidéo en clair.
5. **Cycle de vie** : seuls les deux participants de l'appel peuvent accepter, refuser, terminer ou échanger de la signalisation. À la fin de l'appel ou à la révocation d'un accès, les clients ferment leur `RTCPeerConnection` et libèrent les pistes média ; le serveur notifie les participants concernés.
6. **Qualité** : pour l'extension FR-13, le client peut échantillonner `RTCPeerConnection.getStats()` (RTT, jitter, perte de paquets, débit et type de candidat) et transmettre des lots à l'API authentifiée. Les données collectées sont minimisées, horodatées et associées à l'appel ; leur rétention et leur fréquence doivent être bornées. Aucune qualité cible n'est affirmée avant mesure.

## Conséquences

- Le chemin direct évite de consommer les ressources du relais. coturn améliore la connectivité dans les réseaux où le P2P direct échoue, au prix de bande passante sortante/entrante, de capacité à dimensionner et d'une supervision supplémentaire.
- coturn devient une dépendance de disponibilité pour les appels qui nécessitent un relais. Si TURN est indisponible, les pairs peuvent encore se connecter directement lorsque leur réseau l'autorise ; les autres appels échouent. Le déploiement doit surveiller la disponibilité du service et la capacité réseau.
- Le chiffrement DTLS-SRTP protège le contenu média de bout en bout entre les pairs, y compris lorsque TURN relaie les paquets. Le relais voit néanmoins des métadonnées réseau nécessaires à son fonctionnement (adresses IP, volumes, durée et allocations), ce qui doit être pris en compte dans la politique de journalisation.
- **Limite du mesh** : pour (n) participants, un maillage complet nécessite (n(n-1)/2) connexions pair-à-pair et transporte jusqu'à (n(n-1)) flux média directionnels. Chaque participant doit envoyer son média aux (n-1) autres, ce qui fait croître sa bande passante montante et la charge CPU avec le nombre de participants. Le P2P mesh est adapté au 1-1 demandé, pas à une conférence de groupe.
- Un **SFU** résoudrait cette limite en recevant généralement un flux par participant puis en le redistribuant aux autres, ce qui réduit le nombre de flux montants émis par chaque client mais ajoute un serveur média central, ses coûts et son exploitation. Les conférences de groupe (FR-12) et le partage d'écran (FR-15) restent hors périmètre de cette décision.
- Les identifiants TURN éphémères limitent la fenêtre d'abus en cas de fuite, mais ne remplacent ni les quotas de relais, ni la surveillance de la consommation, ni le contrôle de débit.
- Les métriques `getStats()` sont indicatives : disponibilité et précision varient selon le navigateur, le codec et le chemin ICE. Les valeurs collectées ne prouvent pas à elles seules la qualité perçue par l'utilisateur.
- Les ports, certificats, règles de pare-feu et le choix d'exposition réseau de coturn sont définis séparément dans l'ADR-0016 / issue #8.

## À vérifier avant de passer à « accepté »

- [ ] Relecture par le domaine Messagerie et validation de la signalisation Socket.IO.
- [ ] Identifiants TURN temporaires générés côté API et refusés après expiration.
- [ ] Appel audio 1-1 établi en connexion directe et en relais TURN.
- [ ] Appel vidéo 1-1 établi avec contrôle micro/caméra.
- [ ] Refus de signalisation par un utilisateur non participant et après révocation d'accès.
- [ ] Collecte `getStats()` testée et fréquence/rétention documentées si FR-13 est retenue.
- [ ] Mesures de latence, jitter, perte et consommation coturn versées dans `docs/reports/`.
