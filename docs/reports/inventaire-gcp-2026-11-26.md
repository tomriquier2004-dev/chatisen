# Rapport : inventaire des ressources GCP créées à la main (relevé du 26 novembre 2026)

> NFR-07 · Livrable 3 (déploiement reproductible) et 5 (Security) · ADR : [`0012`](../adr/0012-deploiement-et-hebergement.md), [`0016`](../adr/0016-point-d-entree-caddy-et-ports-turn.md), [`0018`](../adr/0018-terraform-et-load-balancer-gcp.md) · Mode d'emploi : [`infra/README.md`](../../infra/README.md)

## Objectif

Garder une trace de ce qui existe réellement dans le projet GCP `chatisen`, créé à la main (console et `gcloud`) avant Terraform : base de départ pour l'import Terraform (#161), pour la séance de preuves (#112) et pour distinguer l'état actuel de la vue cible.

## Méthode

- Relevé en **lecture seule** avec `gcloud` le 2026-11-26 (`instances`, `disks`, `addresses`, `firewall-rules`, `networks`, `resource-policies`, `services list`, `get-iam-policy`).
- Ne figurent ici ni l'adresse IP, ni l'identifiant du projet, ni les adresses e-mail des membres : le dépôt est public. Les rôles sont comptés par type de membre.
- Non relevable avec ces commandes : le budget et son alerte (facturation), les crédits restants. D'après l'équipe, le crédit est de 269 € jusqu'au 2027-02-22 avec une alerte à 135 €.

## Ressources existantes

| Ressource | Valeur relevée |
| --- | --- |
| Région et zone | `europe-west1`, zone `europe-west1-b` |
| Réseau | `default`, mode automatique (sous-réseaux créés par Google) |
| VM | `chatisen-prod`, `e2-standard-2`, Debian, étiquette réseau `chatisen`, IP externe de niveau Premium, redémarrage automatique, migration à chaud, vTPM et surveillance d'intégrité activés, démarrage sécurisé désactivé |
| Disque | `chatisen-prod`, 40 Go, `pd-balanced` |
| IP statique | `chatisen-ip`, externe, région `europe-west1`, utilisée par la VM |
| Compte de service de la VM | `chatisen-vm` (dédié) ; ses rôles n'ont pas été énumérés ici |
| Accès SSH | OS Login activé (`enable-oslogin=TRUE`) |
| Arrêt programmé | stratégie `arret-nuit-minuit` : arrêt à minuit (fuseau Europe/Paris), rattachée à la VM ; pas de démarrage programmé |
| API activées | Compute Engine, OS Login, Cloud Storage (+ BigQuery Storage) |

### Règles de pare-feu VPC

| Règle | Source | Autorise | Cible |
| --- | --- | --- | --- |
| `chatisen-web` | `0.0.0.0/0` | tcp 80, 443 | étiquette `chatisen` |
| `chatisen-turn` | `0.0.0.0/0` | tcp 3478, udp 3478, **tcp 5349**, udp 49152-49252 | étiquette `chatisen` |
| `default-allow-ssh` | `0.0.0.0/0` | tcp 22 | toutes les VM |
| `default-allow-internal` | `10.128.0.0/9` | tcp et udp 0-65535, icmp | toutes les VM |
| `default-allow-icmp` | `0.0.0.0/0` | icmp | toutes les VM |

### Droits (IAM du projet, sans les noms)

| Rôle | Membres |
| --- | --- |
| `roles/owner` | 2 utilisateurs |
| `roles/editor` | 1 compte de service |
| `roles/iam.admin` | 1 utilisateur |
| `roles/serviceusage.serviceUsageAdmin` | 1 utilisateur |
| `roles/storage.admin` | 1 utilisateur |
| `roles/compute.instanceAdmin.v1` | 2 utilisateurs, 1 compte de service |
| `roles/compute.osLogin` | 2 utilisateurs |
| `roles/compute.viewer` | 1 utilisateur |
| Agents de service Google (`compute.serviceAgent`, `compute.instanceGroupManagerServiceAgent`) | 1 compte de service chacun |

## Écarts avec la cible et avec les décisions

| Constat | Décision ou cible | Suite |
| --- | --- | --- |
| `default-allow-ssh` ouverte à Internet | SSH par IAP seulement ([ADR-0016](../adr/0016-point-d-entree-caddy-et-ports-turn.md), [`infra/README.md`](../../infra/README.md)) | #112, ordre du runbook |
| TCP 5349 ouvert par `chatisen-turn` | 5349 fermé (pas de TLS TURN, ADR-0016) | #112 |
| `default-allow-internal` ouvre tous les ports sur `10.128.0.0/9` | à resserrer dans la cible (Prometheus vers coturn 9641 seulement) | à revoir avec Terraform |
| 2 utilisateurs `owner`, 1 compte de service `editor` | moindre privilège ([ADR-0021](../adr/0021-secrets-identites-iam.md)) | à resserrer, rôle par rôle |
| API IAP et OS Login : seul OS Login est activé | IAP exige l'API IAP | #112 |
| Pas de load balancer, pas de Cloud NAT, pas de VM TURN, pas de Cloud SQL, pas de bucket de sauvegardes, pas de Secret Manager | vue cible ([`architecture.md`](../architecture.md) § 8.3) ; ni Secret Manager ni service de secrets en cible ([ADR-0021](../adr/0021-secrets-identites-iam.md)) | après J1, en Terraform |
| IP statique portée par la VM | portée par le load balancer en cible | après J1 |
| VM arrêtée à minuit, mais aussi arrêtée en journée | règle d'équipe : allumée seulement quand on l'utilise | prévenir avant un test (coturn, #117) |

## Limites

- Le relevé est un instantané : toute modification manuelle ultérieure n'y figure pas. Terraform (#161) doit devenir la source de vérité.
- La configuration interne de la VM (Docker, `.env`) est dans le [rapport de déploiement](deploiement-j1-2026-11-26.md), pas ici.
- Les rôles du compte de service `chatisen-vm`, la facturation et le budget n'ont pas été relevés.
