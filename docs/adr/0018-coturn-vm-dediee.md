# ADR-0018 : coturn sur une VM dédiée

- **Statut** : proposé — attente de relecture infra (Sha) et de validation de l'encadrant
- **Date** : 2026-11-25
- **Auteur (domaine)** : Mathys (appels)
- **Relecteurs demandés** : Sha (infra), Tom (Project Owner)
- **Exigences concernées** : FR-09, FR-10, NFR-03, NFR-04, NFR-07
- **Issue** : #117

## Contexte

Le retour d'expérience de l'équipe demande que coturn ne partage pas la VM du reverse proxy et de l'API. Un serveur TURN reçoit du trafic UDP arbitraire, doit exposer une plage de ports relais et nécessite une IP publique stable. Le déploiement sur la VM applicative élargirait le domaine d'impact d'une compromission et couplerait la disponibilité média à celle du point d'entrée HTTP.

L'ADR-0016 garde Caddy sur le port TCP 443 et n'ouvre pas TURN/TLS sur 443. Le réseau de démonstration n'a pas encore été caractérisé. L'issue #117 demande une VM dédiée, une IP statique et un déploiement reproductible.

La réponse de l'encadrant dans `docs/prof-qa.md` mentionne un free tier Oracle Cloud dont l'inscription était en attente. La documentation d'infrastructure actuelle décrit une VM GCP. Le fournisseur, le budget, l'IP et l'autorisation de créer une seconde VM doivent donc être confirmés avant toute création de ressource.

## Décision proposée

1. Héberger coturn sur une **VM distincte** de l'API/Caddy, avec une IP publique statique dédiée.
2. Exposer uniquement UDP/TCP 3478 et UDP 49152-49252 pour les allocations TURN. Ne pas exposer 443 à coturn ; ne pas activer TLS 5349 pour le premier jalon.
3. Activer `use-auth-secret`, `fingerprint`, `no-cli`, `no-loopback-peers`, `no-multicast-peers`, des quotas par utilisateur et globaux, une limite de bande passante et le filtrage des plages privées / link-local / métadonnées cloud.
4. Garder le secret TURN dans un fichier `.env` local à la VM, ignoré par Git, et fournir à l'API le même secret via son gestionnaire de secrets. Ne jamais inscrire la valeur dans l'ADR, le dépôt ou les logs.
5. Publier les métriques coturn sur le port 9641 uniquement sur le réseau privé de supervision ; Prometheus et Grafana ne sont pas exposés à Internet.
6. Épingler l'image `coturn/coturn:4.6.2`. Les fichiers `infra/coturn/` définissent la configuration et le déploiement Compose ; ils attendent une IP publique et une adresse privée fixes.
7. Mesurer le coût de la VM, du disque, de l'IP et du trafic sortant avant mise en service. Arrêter la VM hors des campagnes de test si le fournisseur le permet.

## Conséquences et limites

- Une VM séparée augmente le coût et ajoute un composant réseau à superviser, mais isole le relais média et permet une règle de pare-feu dédiée.
- Les flux TURN ne sont pas protégés par TLS sur 5349 ; les médias restent chiffrés par DTLS-SRTP. Sur un réseau qui bloque UDP, le relais peut être indisponible : ce risque doit être mesuré depuis le réseau de démonstration.
- Le réseau Docker de coturn fixe l'adresse privée du conteneur à `172.30.0.10` et configure la traduction `IP publique / IP privée`. Vérifier l'absence de conflit avec le sous-réseau VPC avant le déploiement.
- L'implémentation du dépôt ne constitue pas une preuve de déploiement : aucune VM, IP statique, règle de pare-feu ou session TURN externe n'est créée par cette PR.

## Relectures et preuves avant acceptation

- [ ] Sha confirme la topologie, les ports, le sous-réseau Docker, les règles de pare-feu et le coût.
- [ ] L'encadrant confirme le fournisseur cloud, l'IP dédiée et le budget / free tier.
- [ ] Déployer coturn sur une VM vierge en suivant `infra/coturn/README.md`.
- [ ] Vérifier les ports depuis un réseau externe et relever les candidats `relay` dans `getStats()`.
- [ ] Prouver le rejet d'identifiants expirés et forgés.
- [ ] Vérifier la cible Prometheus coturn et tester l'alerte `CoturnUnavailable`.
