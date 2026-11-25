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

Pas encore là (issue #12) : Dockerfiles de l'API et du client, Compose de déploiement, coturn, Prometheus et Grafana, workflow de déploiement.
