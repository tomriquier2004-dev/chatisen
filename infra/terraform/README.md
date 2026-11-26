# Terraform : ressources GCP de ChatISEN

Décision : [ADR-0018](../../docs/adr/0018-terraform-et-load-balancer-gcp.md) (statut « proposé »). Cette première version **reprend sans les modifier** les ressources créées à la main le 23 novembre 2026 ([ADR-0012](../../docs/adr/0012-deploiement-et-hebergement.md)) : VM `chatisen-prod`, IP `chatisen-ip`, règles `chatisen-web` et `chatisen-turn`, calendrier `arret-nuit-minuit`. Elle décrit aussi les règles `default-*` du réseau, le compte de service `chatisen-vm`, la règle `chatisen-ssh-iap` et l'API IAP (`network.tf`, `iam.tf`). Elle crée l'instance Cloud SQL ([ADR-0017](../../docs/adr/0017-base-de-donnees-cloud-sql.md), `sql.tf`). La VM TURN, les rôles des comptes de service et le load balancer viendront dans des PR suivantes.

**État (26/11/2026)** : `terraform plan` contre le projet affiche « 5 to import, 0 to add, 0 to change, 0 to destroy » ; `compute.tf` décrit les ressources existantes.

## Règles

- Aucun identifiant de projet, IP, état ni secret dans le dépôt (il est public). Ils passent par `terraform.tfvars` (ignoré par Git) ou `-backend-config`.
- Authentification par le compte Google de la personne qui lance Terraform : `gcloud auth application-default login`. Jamais de clé JSON de compte de service.
- Une fois une ressource reprise par Terraform, on ne la modifie plus dans la console : le changement passe par une PR, sinon le code et GCP divergent.
- Ne jamais lancer `apply` si `plan` annonce `destroy` ou `must be replaced` sur la VM ou l'IP : remplacer l'IP casse le DNS de l'école.

## Rôles GCP nécessaires

| Pour | Rôle |
| --- | --- |
| Lire les ressources, `import`, `plan` | `roles/compute.viewer` |
| Créer et utiliser le bucket d'état | `roles/storage.admin` (ou `roles/storage.objectAdmin` sur le seul bucket, s'il est créé par un administrateur) |
| Projet de quota des identifiants, activation des APIs | `roles/serviceusage.serviceUsageAdmin` |
| Créer et modifier les règles de pare-feu | `roles/compute.securityAdmin` |
| Lire le compte de service de la VM (import) | `roles/iam.serviceAccountViewer` |
| Créer Cloud SQL et son accès privé (`sql.tf`) | `roles/cloudsql.admin`, `roles/compute.networkAdmin`, `roles/servicenetworking.networksAdmin` |
| Donner un rôle au compte de la VM (`iam.tf`) | `roles/resourcemanager.projectIamAdmin` |
| Se connecter par le tunnel IAP | `roles/iap.tunnelResourceAccessor`, `roles/compute.osLogin`, et `roles/iam.serviceAccountUser` sur le compte `chatisen-vm` |

Ils sont accordés par un administrateur IAM du projet (console : IAM et administration, IAM, Accorder l'accès).

## Première utilisation (PowerShell)

1. Outils : `winget install Hashicorp.Terraform` et `winget install Google.CloudSDK`, puis rouvrir le terminal.
2. Identifiants : `gcloud auth login`, `gcloud config set project <ID_PROJET>`, `gcloud auth application-default login`, `gcloud auth application-default set-quota-project <ID_PROJET>`.
3. Bucket d'état, une seule fois pour l'équipe :
   ```powershell
   gcloud storage buckets create gs://<ID_PROJET>-tfstate --location=europe-west1 --uniform-bucket-level-access --public-access-prevention
   gcloud storage buckets update gs://<ID_PROJET>-tfstate --versioning
   ```
4. Variables : copier `terraform.tfvars.example` en `terraform.tfvars` et renseigner `project_id`.
5. Initialiser, depuis `infra/terraform` :
   ```powershell
   terraform init -backend-config="bucket=<ID_PROJET>-tfstate"
   terraform providers lock -platform=windows_amd64 -platform=linux_amd64
   ```
   Le fichier `.terraform.lock.hcl` produit **se commite** (il fige les empreintes du fournisseur).
6. `compute.tf` existe déjà. Pour reprendre une **nouvelle** ressource créée à la main : ajouter son bloc `import`, puis `terraform plan -generate-config-out=generated.tf`.
7. Relire `generated.tf`, puis déplacer son contenu dans le bon fichier et supprimer `generated.tf` :
   - remplacer l'identifiant du projet par `var.project_id`, la zone et la région par `var.zone` et `var.region` ;
   - **retirer l'adresse IP** écrite en clair (attribut `address` de `google_compute_address.web`, `nat_ip` de la VM) : référencer `google_compute_address.web.address` dans la VM, ne rien écrire pour l'IP elle-même ;
   - retirer les attributs calculés que Terraform signale en erreur ;
   - ajouter `lifecycle { prevent_destroy = true }` à la VM et à l'IP.
8. Rejouer `terraform plan` jusqu'à lire **`0 to add, 0 to change, 0 to destroy`** (hors imports), puis `No changes` après l'`apply`. C'est la preuve attendue (ADR-0018, « Ressources existantes importées, `terraform plan` sans changement »).
9. `terraform apply` : avec des imports seuls, il n'écrit que l'état dans le bucket, rien sur GCP.
10. Relire `git diff` : ni IP, ni identifiant de projet, ni `.tfstate`, ni `terraform.tfvars`.

## Cloud SQL (`sql.tf`)

- Instance `chatisen-pg`, PostgreSQL 16, `db-f1-micro`, zonale en `europe-west1-b`, **IP privée seulement** (accès privé aux services sur le réseau `default`), TLS avec certificat client obligatoire (`TRUSTED_CLIENT_CERTIFICATE_REQUIRED`), sauvegarde quotidienne à 02:00 UTC gardée 7 jours, `deletion_protection`.
- Mot de passe de l'utilisateur `chatisen` : jamais dans un fichier. Il passe par la variable d'environnement `TF_VAR_db_password` ; c'est un attribut *write-only*, absent du plan et de l'état. Terraform l'exige à chaque `plan` et `apply` (sinon : « all of password_wo,password_wo_version must be specified »). Il n'est envoyé à GCP qu'à la création et quand `db_password_version` change : ensuite, une valeur quelconque suffit pour un `plan`. Pour le changer : nouvelle valeur et `db_password_version` + 1.
  ```powershell
  $env:TF_VAR_db_password = -join ((48..57 + 97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
  ```
  Le même mot de passe va ensuite dans le `.env` de la VM (`DATABASE_URL`), pas ailleurs.
- Coût : l'instance est facturée tant qu'elle tourne, même sans trafic. Pour l'arrêter : `terraform apply -var="sql_activation_policy=NEVER"` ; pour la relancer, `ALWAYS`. Le stockage reste facturé à l'arrêt.
- Connexion : uniquement par le [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy), qui s'authentifie avec le compte de service `chatisen-vm` (rôle `roles/cloudsql.client`, `iam.tf`) et chiffre la liaison avec un certificat client éphémère. Une connexion directe, même en TLS, est refusée.
- Vérifier depuis la VM (tunnel IAP) :
  ```bash
  # 1. Connexion directe sans certificat client : doit être refusée.
  sudo docker run --rm -it postgres:16 psql "host=<IP_PRIVEE> user=chatisen dbname=chatisen sslmode=require" -c "select 1;"
  # 2. Par le proxy : doit répondre 1.
  sudo docker run -d --rm --name sql-proxy --network host gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.14.1 --private-ip <ID_PROJET>:europe-west1:chatisen-pg
  sudo docker run --rm -it --network host postgres:16 psql "host=127.0.0.1 user=chatisen dbname=chatisen sslmode=disable" -c "select 1;"
  sudo docker stop sql-proxy
  ```
  `<IP_PRIVEE>` : `terraform output sql_private_ip`. `sslmode=disable` ne concerne que le trajet local vers le proxy ; le proxy chiffre la liaison vers Cloud SQL.

## Vérifications

```powershell
terraform fmt -check -recursive
terraform validate
terraform plan
```
