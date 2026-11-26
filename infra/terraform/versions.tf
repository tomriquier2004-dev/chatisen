terraform {
  # Les blocs `import` avec un identifiant calculé et `-generate-config-out` demandent Terraform 1.6 ou plus.
  required_version = ">= 1.6"

  required_providers {
    google = {
      source = "hashicorp/google"
      # Version publiée depuis plus de 7 jours (règle de délai des dépendances, AGENTS.md).
      version = "~> 8.12"
    }
  }
}
