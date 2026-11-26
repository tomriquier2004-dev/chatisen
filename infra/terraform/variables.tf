variable "project_id" {
  description = "Identifiant du projet GCP. Fourni par terraform.tfvars (ignoré par Git), jamais écrit dans le dépôt."
  type        = string
}

variable "region" {
  description = "Région des ressources (ADR-0012)."
  type        = string
  default     = "europe-west1"
}

variable "zone" {
  description = "Zone de la VM web (ADR-0012)."
  type        = string
  default     = "europe-west1-b"
}
