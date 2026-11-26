# Authentification par les Application Default Credentials du compte Google de la personne qui lance Terraform
# (`gcloud auth application-default login`). Jamais de clé JSON de compte de service (infra/README.md, ADR-0021).
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
