# Cloud SQL pour PostgreSQL (ADR-0017) : IP privée seulement, TLS avec certificat client, sauvegardes automatiques.
# Coût : facturé tant que l'instance tourne, VM éteinte ou non. Pour l'arrêter hors séance :
#   terraform apply -var="sql_activation_policy=NEVER"

resource "google_project_service" "sqladmin" {
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "servicenetworking" {
  service            = "servicenetworking.googleapis.com"
  disable_on_destroy = false
}

data "google_compute_network" "default" {
  name = "default"
}

# Plage d'adresses privées réservée aux services gérés de Google (accès privé aux services).
resource "google_compute_global_address" "private_services" {
  name          = "chatisen-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = data.google_compute_network.default.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = data.google_compute_network.default.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]

  depends_on = [google_project_service.servicenetworking]
}

resource "google_sql_database_instance" "main" {
  name             = "chatisen-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  # Une suppression par erreur perdrait les données : il faut d'abord passer ceci à false par une PR.
  deletion_protection = true

  settings {
    edition           = "ENTERPRISE"
    tier              = var.sql_tier
    availability_type = "ZONAL"
    activation_policy = var.sql_activation_policy
    disk_type         = "PD_SSD"
    disk_size         = 10

    location_preference {
      zone = var.zone
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = data.google_compute_network.default.id
      # TLS avec certificat client : la VM passe par le Cloud SQL Auth Proxy, qui gère des certificats éphémères.
      ssl_mode = "TRUSTED_CLIENT_CERTIFICATE_REQUIRED"
    }

    backup_configuration {
      enabled    = true
      start_time = "02:00"

      backup_retention_settings {
        retained_backups = 7
      }
    }

    maintenance_window {
      day  = 7
      hour = 3
    }
  }

  depends_on = [
    google_project_service.sqladmin,
    google_service_networking_connection.private_services,
  ]
}

resource "google_sql_database" "chatisen" {
  name     = "chatisen"
  instance = google_sql_database_instance.main.name
}

# Utilisateur de l'API, sans droit d'administration sur l'instance. Le mot de passe est en écriture seule :
# il n'est enregistré ni dans le plan ni dans l'état Terraform. Le changer = nouvelle valeur + version + 1.
resource "google_sql_user" "api" {
  name                = "chatisen"
  instance            = google_sql_database_instance.main.name
  password_wo         = var.db_password
  password_wo_version = var.db_password_version
}

output "sql_private_ip" {
  description = "IP privée de l'instance, pour DATABASE_URL sur la VM. Ne pas la commiter."
  value       = google_sql_database_instance.main.private_ip_address
}
