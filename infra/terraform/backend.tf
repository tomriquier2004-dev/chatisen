# État stocké dans un bucket Cloud Storage versionné (ADR-0018 § 4).
# Le nom du bucket n'est pas écrit ici : il contient l'identifiant du projet, qui reste hors du dépôt public.
#   terraform init -backend-config="bucket=<ID_PROJET>-tfstate"
terraform {
  backend "gcs" {
    prefix = "chatisen"
  }
}
