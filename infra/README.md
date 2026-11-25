# Infrastructure ChatISEN

Mode d'emploi de l'hôte de déploiement et du contenu de `infra/`. Décisions : [ADR-0012](../docs/adr/0012-deploiement-et-hebergement.md) (hébergement) et [ADR-0016](../docs/adr/0016-point-d-entree-caddy-et-ports-turn.md) (point d'entrée, ports).

## L'hôte

| Élément | Valeur |
| --- | --- |
| Fournisseur | Google Cloud, Compute Engine (essai gratuit : crédit de 269 € jusqu'au 22 février 2027) |
| VM | `chatisen-prod`, zone `europe-west1-b`, `e2-standard-2` (2 vCPU, 8 Go), Debian 12, amd64 |
| IP publique | adresse statique réservée `chatisen-ip` (région `europe-west1`) |
| Nom de domaine | `dc-ops.isen.fedyna.fr` (un seul nom, pas de sous-domaine) |
| Étiquette réseau | `chatisen` (les règles de pare-feu applicatives ciblent cette étiquette) |

**La VM est éteinte par défaut.** On l'allume pour travailler et on l'éteint ensuite : un calendrier d'instance l'arrête aussi chaque nuit à 00h00 (Paris). Éteinte, elle ne coûte que son disque et son IP.

## Obtenir l'accès (une seule fois)

Sha ou Tom (administrateurs IAM du projet) ajoutent ton compte Google dans IAM avec deux rôles : « Administrateur d'instances Compute (v1) » (démarrer, arrêter) et « Connexion au système d'exploitation Compute » (SSH par OS Login). Ces rôles ne donnent accès ni à la facturation ni à l'administration IAM. Communique à Sha l'adresse du compte Google à utiliser **en privé** : elle ne s'écrit pas dans le dépôt.

## Se connecter

1. Installer le SDK : `winget install Google.CloudSDK` (Windows), puis rouvrir le terminal.
2. `gcloud auth login` avec le compte Google qui a reçu l'accès au projet.
3. `gcloud config set project <ID_PROJET>`. L'identifiant du projet se demande à Sha, il n'est pas dans le dépôt.

Ne jamais créer ni commiter de clé JSON de compte de service, de mot de passe ou de jeton.

**Depuis un autre appareil** (second PC, poste d'un binôme) : mêmes trois étapes, avec le même compte Google. Aucune clé à copier : `gcloud compute ssh` crée et enregistre lui-même une clé pour cet appareil via OS Login. Ne jamais déplacer une clé privée d'un appareil à l'autre. Le nom d'utilisateur Linux sur la VM est dérivé du compte Google (par exemple `prenom_nom_gmail_com`), il est affiché à la première connexion.

**Sans installer `gcloud`** : dans la console Google Cloud, Compute Engine puis Instances, le bouton « SSH » de la ligne `chatisen-prod` ouvre un terminal dans le navigateur. Il demande les mêmes rôles et sert aussi quand le réseau local bloque le port 22.

## Commandes courantes

Voir l'état :

```powershell
gcloud compute instances list --format="table(name,zone.basename(),status)"
```

Allumer, puis se connecter (la connexion SSH passe par OS Login, sans clé à gérer) :

```powershell
gcloud compute instances start chatisen-prod --zone=europe-west1-b
```

```powershell
gcloud compute ssh chatisen-prod --zone=europe-west1-b
```

Éteindre en fin de session :

```powershell
gcloud compute instances stop chatisen-prod --zone=europe-west1-b
```

Lire l'IP publique :

```powershell
gcloud compute addresses describe chatisen-ip --region=europe-west1 --format="value(address)"
```

**Règle d'équipe** : celui qui allume éteint. L'astreinte de la semaine vérifie chaque soir que la VM est éteinte. Dans les commandes PowerShell, mettre entre guillemets tout argument qui contient une virgule.

Sur la VM, les commandes Docker de ce document s'écrivent avec `sudo` (`sudo docker ...`).

## Crédit, coûts et arrêt automatique

- **Lire le crédit restant** : console Google Cloud, Facturation, vue d'ensemble : la carte « Welcome credit » affiche le crédit restant et les jours restants. Une alerte de budget prévient par e-mail aux seuils de 25, 50, 75 et 90 % de 135 € ; elle ne coupe rien.
- **Ne jamais cliquer sur « Mettre à niveau »** : le compte reste en essai gratuit, rien n'est facturé tant qu'on ne passe pas à un compte payant (indication de la console).
- **Éteinte, la VM coûte encore** son disque et son IP statique, sur le crédit. L'arrêt économise le calcul seulement.
- **Arrêt automatique de 00h00** : il a été configuré par Sha et reste à vérifier le premier soir (ADR-0012). Pour une séance qui dépasse minuit (mesures, répétition de démo), suspendre le calendrier d'instance dans la console avant la séance (Compute Engine, calendriers d'instance : l'intitulé exact est à vérifier), puis le réactiver. Après un arrêt automatique, rallumer la VM à la main.
- Une VM éteinte ne fait ni sauvegarde, ni collecte de métriques, ni déploiement : l'allumer avant toute séance de mesure ou de déploiement.

## Ports

La source de vérité est le pare-feu GCP ; en cas d'écart, corriger ce tableau.

```powershell
gcloud compute firewall-rules list --format="table(name,direction,sourceRanges.list(),allowed[].map().firewall_rule().list(),targetTags.list())"
```

| Port | Protocole | Règle GCP | Usage | État |
| --- | --- | --- | --- | --- |
| 80, 443 | TCP | `chatisen-web` | Caddy : HTTP (redirection, validation du certificat) et HTTPS | ouvert à Internet |
| 3478 | UDP et TCP | `chatisen-turn` | coturn | ouvert, rien n'écoute avant le déploiement de coturn |
| 5349 | TCP | `chatisen-turn` | coturn en TLS | ouvert, **pas de service prévu** pour l'instant (ADR-0016) |
| 49152-49252 | UDP | `chatisen-turn` | relais média de coturn | ouvert, rien n'écoute avant coturn |
| 22 | TCP | `default-allow-ssh` | SSH (OS Login, clé) | **ouvert à Internet, à restreindre** (IAP) |
| ICMP | | `default-allow-icmp` | ping | ouvert |
| tout | TCP/UDP | `default-allow-internal` | réseau interne `10.128.0.0/9` | interne seulement |
| 3389 | TCP | _supprimée le 25/11/2026_ | RDP | fermé |

Jamais exposés à Internet : PostgreSQL (5432), Redis (6379), l'API (3000), Prometheus, Grafana, Loki. Un nouveau port s'ouvre seulement avec une mise à jour de ce tableau et de l'ADR concerné.

## Restreindre le SSH avec IAP (à faire, VM allumée pour tester)

Aujourd'hui `default-allow-ssh` laisse le port 22 ouvert à tout Internet. Avec IAP (Identity-Aware Proxy), le SSH passe par un tunnel de Google authentifié par le compte Google : le port 22 n'est alors ouvert qu'aux adresses de Google (`35.235.240.0/20`). Les runners GitHub ont des adresses variables, impossibles à lister : IAP règle aussi ce point pour le futur déploiement.

Respecter cet ordre, sinon on se verrouille dehors. Les étapes 1 à 4 s'ajoutent sans rien casser ; seule la 5 ferme l'accès actuel.

1. Activer l'API :

```powershell
gcloud services enable iap.googleapis.com
```

2. Autoriser les adresses de Google sur le port 22 :

```powershell
gcloud compute firewall-rules create chatisen-ssh-iap --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=chatisen
```

3. Sha ou Tom donnent à chaque membre le rôle « Utilisateur de tunnel sécurisé par IAP » (`roles/iap.tunnelResourceAccessor`), un compte à la fois :

```powershell
gcloud projects add-iam-policy-binding <ID_PROJET> --member="user:<COMPTE_GOOGLE>" --role="roles/iap.tunnelResourceAccessor"
```

4. **Chacun** teste la connexion par le tunnel :

```powershell
gcloud compute ssh chatisen-prod --zone=europe-west1-b --tunnel-through-iap
```

5. Seulement quand tout le monde a réussi, fermer l'accès ouvert à tout Internet :

```powershell
gcloud compute firewall-rules delete default-allow-ssh
```

Puis prouver la fermeture depuis un réseau qui laisse sortir le port 22 (la section ci-dessous distingue « filtré » et « refusé »), et consigner la sortie dans `docs/reports/`. Ensuite, ajouter `--tunnel-through-iap` aux commandes `gcloud compute ssh` de ce document. Le bouton « SSH » de la console devrait continuer de fonctionner, car il se connecte depuis des adresses de Google : à vérifier après la fermeture.

## Tester les ports et le TLS du point d'entrée (sans application)

Prépare cette séance : la VM allumée coûte quelques centimes de l'heure, on éteint dès que les preuves sont prises.

1. Allumer la VM et s'y connecter (commandes ci-dessus).
2. Sur la VM, récupérer les fichiers (tant que la branche n'est pas fusionnée, ajouter `-b <branche>`) :

```bash
git clone --depth 1 https://github.com/tomriquier2004-dev/chatisen && cd chatisen/infra/compose
```

3. **Valider la configuration** avant de démarrer. Cette étape n'a pas encore été exécutée par l'auteur du fichier : si elle échoue, corriger `infra/caddy/Caddyfile.ports-test` :

```bash
sudo docker run --rm -e SITE_ADDRESS=:80 -v "$PWD/../caddy/Caddyfile.ports-test:/etc/caddy/Caddyfile:ro" caddy:2.11.9-alpine caddy validate --config /etc/caddy/Caddyfile
```

4. Démarrer :

```bash
sudo docker compose -f compose.ports-test.yml up -d
```

5. **Depuis un réseau extérieur à la VM** (ton PC, idéalement aussi le téléphone en 4G), avec `<IP>` l'IP publique :

```powershell
Test-NetConnection <IP> -Port 80
```

```powershell
curl.exe -i http://<IP>/api/v1/health/live
```

```powershell
curl.exe -k -i https://<IP>
```

6. **Prouver la fermeture** : les ports non listés comme ouverts doivent échouer. Un port bloqué par le pare-feu ne répond pas (délai dépassé) ; un port autorisé mais sans service refuse tout de suite la connexion. Cette différence est la preuve que le pare-feu fait son travail.

```powershell
Test-NetConnection <IP> -Port 3389
```

Faire de même pour 5432, 6379, 3000 et 9090. Garder les sorties pour le rapport (`docs/reports/`), sans secret.

7. **Avec le nom de domaine**, seulement quand `nslookup dc-ops.isen.fedyna.fr` renvoie l'IP de la VM (Let's Encrypt limite les validations échouées) :

```bash
sudo SITE_ADDRESS=dc-ops.isen.fedyna.fr docker compose -f compose.ports-test.yml up -d --force-recreate
```

```powershell
curl.exe -i https://dc-ops.isen.fedyna.fr/api/v1/health/live
```

8. **Nettoyer et éteindre** :

```bash
sudo docker compose -f compose.ports-test.yml down
```

Le test des ports UDP du relais TURN (49152-49252) se fera avec coturn déployé, par Mathys.

## Accéder à Grafana (quand il sera déployé)

Grafana et Prometheus n'écoutent que sur `127.0.0.1` de la VM. Depuis ton PC, par tunnel SSH :

```powershell
gcloud compute ssh chatisen-prod --zone=europe-west1-b -- -L 3000:localhost:3000
```

puis ouvrir `http://localhost:3000`. Pour la soutenance, préparer le tunnel à l'avance ou projeter des captures.

## Dépannage

| Symptôme | Cause probable | Que faire |
| --- | --- | --- |
| `gcloud` demande de se reconnecter | session expirée | `gcloud auth login` |
| Erreur 403 ou « permission denied » au SSH ou au démarrage | rôles IAM manquants | demander à Sha ou Tom de vérifier les deux rôles de ton compte (section « Obtenir l'accès ») |
| « resource not found » | mauvais projet actif | `gcloud config get-value project`, puis `gcloud config set project <ID_PROJET>` |
| La connexion SSH n'aboutit pas (délai dépassé) | VM éteinte (`TERMINATED`), ou réseau local qui bloque le port 22 | vérifier l'état de la VM, la démarrer si besoin ; sinon utiliser le bouton « SSH » de la console |
| `permission denied` sur `docker` | commande lancée sans `sudo` | préfixer par `sudo` |
| Le nom `dc-ops.isen.fedyna.fr` ne répond pas encore à l'IP de la VM | le TTL de l'ancien enregistrement est de 15 min | attendre, puis vérifier avec `nslookup dc-ops.isen.fedyna.fr 8.8.8.8` ; ne pas démarrer Caddy avec le nom tant que la réponse n'est pas l'IP de la VM |
| Caddy n'obtient pas de certificat | DNS pas encore à jour, port 80 injoignable, ou VM éteinte | lire les journaux : `sudo docker compose -f compose.ports-test.yml logs caddy` ; corriger la cause avant de relancer (Let's Encrypt limite les validations échouées) |
| Argument PowerShell coupé à la virgule | PowerShell découpe les virgules non protégées | mettre l'argument entre guillemets |

## Contenu de `infra/`

| Dossier | Contenu |
| --- | --- |
| `backup/` | Sauvegardes PostgreSQL chiffrées (age) et test de restauration |
| `caddy/` | `Caddyfile` (production) et `Caddyfile.ports-test` (test sans application) |
| `compose/` | `compose.dev.yml` (données de développement) et `compose.ports-test.yml` (test du point d'entrée) |
| `github/` | Rulesets du dépôt décrits en code |
| `coturn/` | Configuration et Compose du relais TURN dédié |
| `observability/` | Prometheus, Grafana, dashboard et règles d'alerte |

Restent à finaliser : workflow de déploiement applicatif, provisionnement de la VM coturn après validation humaine, et test opérationnel des alertes sur l'infrastructure cible.

## Coturn sur une VM dédiée

Le relais média est isolé de la VM Caddy/API conformément à la proposition [ADR-0018](../docs/adr/0018-coturn-vm-dediee.md). Le fournisseur, le coût et l'autorisation de créer cette VM restent à confirmer par l'encadrant et Sha ; ne pas créer de ressource cloud avant leur validation.

La configuration reproductible, le fichier de paramètres et les étapes de test sont dans [`infra/coturn/`](coturn/README.md). Elle épingle `coturn/coturn:4.6.2`, utilise le secret TURN REST hors dépôt, UDP/TCP 3478 et UDP 49152-49252. La métrique coturn est servie sur 9641 uniquement sur le réseau privé de supervision et en loopback sur la VM.

## Prometheus et Grafana

La stack de supervision est versionnée dans [`infra/observability/`](observability/compose.yml). Elle comprend Prometheus, Grafana provisionné, le tableau de bord `ChatISEN — appels et TURN` et les alertes `CoturnUnavailable` et `CallNegotiationFailureRateHigh`.

Préparer le réseau privé et la stack :

```bash
sudo docker network create chatisen-observability
cd infra/observability
cp .env.example .env
openssl rand -base64 36  # mot de passe Grafana
chmod 600 .env
# Renseigner GRAFANA_ADMIN_PASSWORD dans .env
sudo docker compose --env-file .env -f compose.yml up -d
```

Attacher le conteneur API au réseau `chatisen-observability` et configurer `API_HOST=0.0.0.0` dans le conteneur ; Prometheus scrute `api:3000/metrics`. Le service coturn rejoint ce réseau via `infra/coturn/compose.yml` et expose `coturn:9641/metrics`. Ne pas publier le port 9641 sur une interface publique.

Accès opérateur par tunnel SSH, sans ouvrir de port public :

```bash
ssh -L 9090:127.0.0.1:9090 -L 3001:127.0.0.1:3001 <utilisateur>@<vm>
```

Puis ouvrir Prometheus sur `http://127.0.0.1:9090` et Grafana sur `http://127.0.0.1:3001`.

### Test de l'alerte coturn

Après déploiement et validation de la cible `coturn` dans Prometheus, arrêter temporairement le conteneur TURN pendant plus d'une minute dans une fenêtre de test :

```bash
sudo docker stop chatisen-coturn
# Vérifier l'état firing de CoturnUnavailable dans Prometheus / Grafana.
sudo docker start chatisen-coturn
```

Le test doit être réalisé en dehors d'un appel réel. Consigner la date, le temps de détection et le retour à l'état normal dans `docs/reports/`. Il n'a pas été exécuté depuis cette session : aucune VM TURN dédiée ni aucun destinataire d'alerte opérationnel n'est encore configuré.


### Runbook court : coturn indisponible

1. Vérifier l'alerte `CoturnUnavailable` et l'état de la cible dans Prometheus (`Status → Targets`).
2. Sur la VM TURN, vérifier le conteneur et les journaux :
   ```bash
   sudo docker inspect --format '{{.State.Health.Status}}' chatisen-coturn
   sudo docker compose --project-directory infra/coturn --env-file infra/coturn/.env -f infra/coturn/compose.yml logs --tail=200 coturn
   sudo ss -lunpt | grep -E ':(3478|491[5-9][0-9]|492[0-5][0-9]|49252)\b'
   ```
3. Vérifier l'IP publique statique, les règles firewall UDP/TCP 3478 et UDP 49152-49252, puis l'adresse privée configurée dans `TURN_INTERNAL_IP`.
4. Si le processus est bloqué, recréer le service :
   ```bash
   sudo docker compose --project-directory infra/coturn --env-file infra/coturn/.env -f infra/coturn/compose.yml up -d --force-recreate coturn
   curl --fail http://127.0.0.1:9641/metrics
   ```
5. Valider un nouvel appel depuis deux réseaux distincts et vérifier `candidateType=relay` dans `getStats()`. Ne pas basculer TURN sur 443 : ce port reste réservé à Caddy.

Les appels P2P déjà établis peuvent continuer pendant une panne TURN ; les nouveaux appels derrière des NAT restrictifs risquent d'échouer. Si la VM ou son IP est perdue, restaurer l'IP statique avant de modifier `TURN_URLS` côté API.
