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

variable "sql_tier" {
  description = "Type de machine Cloud SQL (ADR-0017) : db-f1-micro, db-g1-small si les mesures le demandent."
  type        = string
  default     = "db-f1-micro"
}

variable "sql_activation_policy" {
  description = "ALWAYS (instance allumée) ou NEVER (arrêtée hors séance, seuls le disque et les sauvegardes sont facturés)."
  type        = string
  default     = "ALWAYS"

  validation {
    condition     = contains(["ALWAYS", "NEVER"], var.sql_activation_policy)
    error_message = "sql_activation_policy doit valoir ALWAYS ou NEVER."
  }
}

variable "db_password" {
  description = "Mot de passe de l'utilisateur chatisen. À fournir par la variable d'environnement TF_VAR_db_password, jamais dans un fichier."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
}

variable "db_password_version" {
  description = "À incrémenter pour pousser un nouveau db_password (attribut en écriture seule)."
  type        = number
  default     = 1
}
