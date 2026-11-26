# Ressources créées à la main le 23 novembre 2026 (ADR-0012), reprises par les blocs `import` de imports.tf.
# Le code décrit l'état existant : `terraform plan` doit afficher « No changes » hors imports.
# Aucune IP ni identifiant de projet en clair (dépôt public).

resource "google_compute_resource_policy" "nightly_stop" {
  name   = "arret-nuit-minuit"
  region = var.region

  instance_schedule_policy {
    time_zone = "Europe/Paris"

    vm_stop_schedule {
      schedule = "0 0 * * *"
    }
  }
}

resource "google_compute_address" "web" {
  name         = "chatisen-ip"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"

  lifecycle {
    # Le DNS de l'école pointe sur cette IP : la recréer la changerait.
    prevent_destroy = true
  }
}

resource "google_compute_firewall" "web" {
  name          = "chatisen-web"
  network       = "default"
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["chatisen"]

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }
}

resource "google_compute_firewall" "turn" {
  name          = "chatisen-turn"
  network       = "default"
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["chatisen"]

  allow {
    protocol = "tcp"
    ports    = ["3478"]
  }

  allow {
    protocol = "udp"
    ports    = ["3478"]
  }

  allow {
    protocol = "udp"
    ports    = ["49152-49252"]
  }

  # Ouvert sans service (ADR-0016) : à fermer dans une PR séparée, pas pendant l'import.
  allow {
    protocol = "tcp"
    ports    = ["5349"]
  }
}

resource "google_compute_instance" "web" {
  name              = "chatisen-prod"
  zone              = var.zone
  machine_type      = "e2-standard-2"
  tags              = ["chatisen"]
  resource_policies = [google_compute_resource_policy.nightly_stop.self_link]

  metadata = {
    enable-oslogin = "TRUE"
  }

  boot_disk {
    auto_delete = true
    device_name = "persistent-disk-0"

    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 40
      type  = "pd-balanced"
    }
  }

  network_interface {
    network    = "default"
    subnetwork = "default"
    stack_type = "IPV4_ONLY"

    access_config {
      nat_ip       = google_compute_address.web.address
      network_tier = "PREMIUM"
    }
  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    preemptible         = false
    provisioning_model  = "STANDARD"
  }

  service_account {
    email  = "chatisen-vm@${var.project_id}.iam.gserviceaccount.com"
    scopes = []
  }

  shielded_instance_config {
    enable_integrity_monitoring = true
    enable_secure_boot          = false
    enable_vtpm                 = true
  }

  lifecycle {
    prevent_destroy = true
    # L'image de démarrage ne sert qu'à la création : une image Debian plus récente ne doit pas recréer la VM.
    ignore_changes = [boot_disk[0].initialize_params]
  }
}
