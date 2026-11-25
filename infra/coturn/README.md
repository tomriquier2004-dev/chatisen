# Déployer coturn sur une VM dédiée

Cette pile prépare coturn pour la vue cible où le relais TURN est isolé de la VM Caddy/API. Elle ne crée pas la VM, l'IP statique ni les règles de pare-feu cloud. En J1, coturn peut rester sur la VM applicative ; voir les différences de supervision ci-dessous.

## Pré-requis

- VM Linux dédiée avec Docker Engine + Compose v2 ; IPv4 publique statique et IPv4 privée.
- UDP/TCP 3478 et UDP 49152-49252 autorisés vers l'IP publique TURN.
- TCP 9641 autorisé uniquement depuis l'IP privée de la VM web (Prometheus). Ne jamais l'ouvrir à Internet.
- Vérifier que le sous-réseau Docker `172.30.0.0/24` ne chevauche aucun réseau VPC / VPN.
- Accord infra sur la topologie et le coût ; voir [ADR-0019](../../docs/adr/0019-coturn-vm-dediee.md).

## Configuration et secret

```bash
cp .env.example .env
openssl rand -base64 48 | tr -d '\n' > .turn_shared_secret
chmod 600 .env .turn_shared_secret
```

Renseigner `TURN_REALM`, `TURN_EXTERNAL_IP` (IP publique statique), `TURN_INTERNAL_IP=172.30.0.10` (IP du conteneur TURN) et `TURN_METRICS_BIND_IP` (IP privée de la VM TURN ; garder `127.0.0.1` uniquement pour la vue J1 sur un seul hôte). Le chemin `TURN_SECRET_FILE=.turn_shared_secret` désigne le fichier secret local, ignoré par Git.

Fournir la même valeur à l'API via son gestionnaire de secrets sous `TURN_SHARED_SECRET`. Ne pas la placer dans le `.env` de coturn, dans une ligne de commande ou dans le dépôt.

Docker Compose monte le fichier comme secret dans `/run/secrets/turn_shared_secret`. L'entrypoint génère `/run/coturn/turnserver.conf` dans un `tmpfs` en mémoire, puis lance `turnserver` avec le seul chemin du fichier de configuration. La valeur du secret n'est donc pas visible dans les arguments de processus de `docker inspect` ; le fichier temporaire disparaît à l'arrêt du conteneur.

Le conteneur a l'adresse privée fixe `172.30.0.10`. `external-ip=PUBLIC/172.30.0.10` permet à coturn d'annoncer l'adresse publique aux navigateurs malgré le NAT Docker. Le sous-réseau doit être libre.

## Démarrage et vérification

```bash
sudo ./deploy.sh
sudo docker compose --env-file .env -f compose.yml ps
sudo docker compose --env-file .env -f compose.yml logs --tail=100 coturn
curl --fail "http://$TURN_METRICS_BIND_IP:9641/metrics" | head
```

Le port de métriques est lié à `TURN_METRICS_BIND_IP`. En vue cible, cette variable doit contenir l'IP privée de la VM TURN, pas `127.0.0.1`, afin que Prometheus sur la VM web puisse joindre l'exporter.

## Cibles Prometheus

Copier `infra/observability/targets/coturn.yml.example` vers `infra/observability/targets/coturn.yml`.

- **J1, une VM** : conserver la cible `coturn:9641`, accessible par le réseau Docker `chatisen-observability`.
- **Vue cible, VM TURN séparée** : remplacer la cible par `<IP_PRIVEE_VM_TURN>:9641`. Le service Prometheus sur la VM web contacte alors l'adresse privée de l'hôte TURN, pas un alias Docker de l'autre machine.

Créer une règle de pare-feu VPC autorisant TCP 9641 depuis la seule VM web / son tag réseau. L'exporter ne doit être joignable ni depuis Internet ni depuis d'autres sources non nécessaires.

## Pare-feu

| Port | Protocole | Source / destination | Rôle |
| --- | --- | --- | --- |
| 3478 | UDP + TCP | Internet vers IP TURN | STUN/TURN |
| 49152-49252 | UDP | Internet vers IP TURN | allocations relais média |
| 9641 | TCP | VM web (Prometheus) vers IP privée TURN | Prometheus `/metrics`, réseau privé seulement |

Ne pas ouvrir TCP 5349 ou TCP/UDP 443 pour ce déploiement. Le média reste chiffré DTLS-SRTP ; le transport TURN n'est pas TLS.

## Vérification fonctionnelle externe

1. Depuis deux navigateurs sur deux réseaux distincts, établir un appel en forçant `iceTransportPolicy: "relay"` dans un environnement de test isolé.
2. Vérifier dans `RTCPeerConnection.getStats()` qu'une paire sélectionnée référence un candidat local `candidateType=relay` et que l'appel passe à `connected`.
3. Générer un identifiant TURN REST au format `expiration:userId` et son HMAC-SHA1 Base64 avec le secret partagé ; vérifier que l'identifiant expiré et un mot de passe forgé échouent à l'allocation.
4. Consigner la date, les deux réseaux, l'adresse du serveur, les versions, le type de candidat et les limites dans `docs/reports/`.

**État actuel : non déployé et non testé depuis un réseau externe.** Les étapes ci-dessus restent à réaliser sur la VM dédiée après validation du fournisseur et du coût.
