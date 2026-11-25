# Déployer coturn sur une VM dédiée

Cette pile est séparée de la VM Caddy/API. Elle prépare le service, mais ne crée pas la VM, l'IP statique ni les règles de pare-feu cloud.

## Pré-requis

- VM Linux dédiée avec Docker Engine + Compose v2 ; IPv4 publique statique et IPv4 privée.
- UDP/TCP 3478 et UDP 49152-49252 autorisés vers la VM. Ne pas ouvrir le port 9641 à Internet.
- Vérifier que le sous-réseau Docker `172.30.0.0/24` ne chevauche aucun réseau VPC / VPN.
- Accord infra sur la topologie et le coût ; voir [ADR-0018](../../docs/adr/0018-coturn-vm-dediee.md).

## Configuration

```bash
cp .env.example .env
openssl rand -base64 48
chmod 600 .env
```

Renseigner `TURN_REALM`, `TURN_SHARED_SECRET`, `TURN_EXTERNAL_IP` (IP publique statique) et `TURN_INTERNAL_IP=172.30.0.10` (IP du conteneur TURN). Ne jamais commiter `.env`. Configurer `TURN_SHARED_SECRET` identiquement dans l'environnement de l'API et renseigner `TURN_URLS` avec `turn:<IP-ou-nom>:3478?transport=udp,turn:<IP-ou-nom>:3478?transport=tcp`.

Le conteneur a l'adresse privée fixe `172.30.0.10`. `external-ip=PUBLIC/172.30.0.10` permet à coturn d'annoncer l'adresse publique aux navigateurs malgré le NAT Docker. Le sous-réseau doit être libre.

## Démarrage et vérification

```bash
sudo ./deploy.sh
sudo docker compose --env-file .env -f compose.yml ps
sudo docker compose --env-file .env -f compose.yml logs --tail=100 coturn
curl --fail http://127.0.0.1:9641/metrics | head
```

Le service expose Prometheus sur le réseau Docker privé `chatisen-observability` et en loopback sur l'hôte seulement. Attacher Prometheus à ce réseau ; ne pas publier 9641 sur une interface publique.

## Pare-feu

| Port | Protocole | Source / destination | Rôle |
| --- | --- | --- | --- |
| 3478 | UDP + TCP | Internet vers IP TURN | STUN/TURN |
| 49152-49252 | UDP | Internet vers IP TURN | allocations relais média |
| 9641 | TCP | réseau privé de supervision seulement | Prometheus `/metrics` |

Ne pas ouvrir TCP 5349 ou TCP/UDP 443 pour ce déploiement. Le média reste chiffré DTLS-SRTP ; le transport TURN n'est pas TLS.

## Vérification fonctionnelle externe

1. Depuis deux navigateurs sur deux réseaux distincts, établir un appel en forçant `iceTransportPolicy: "relay"` dans un environnement de test isolé.
2. Vérifier dans `RTCPeerConnection.getStats()` qu'une paire sélectionnée référence un candidat local `candidateType=relay` et que l'appel passe à `connected`.
3. Générer un identifiant TURN REST au format `expiration:userId` et son HMAC-SHA1 Base64 avec le secret partagé ; vérifier que l'identifiant expiré et un mot de passe forgé échouent à l'allocation.
4. Consigner la date, les deux réseaux, l'adresse du serveur, les versions, le type de candidat et les limites dans `docs/reports/`.

**État actuel : non déployé et non testé depuis un réseau externe.** Les étapes ci-dessus restent à réaliser sur la VM dédiée après validation du fournisseur et du coût.