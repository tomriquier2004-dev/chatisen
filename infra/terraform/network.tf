# Règles du réseau `default` créées par Google, reprises telles quelles, et accès SSH par IAP.
# Ordre à respecter (infra/README.md, issue #112) : 1) cette PR ajoute chatisen-ssh-iap ;
# 2) chaque membre teste `gcloud compute ssh ... --tunnel-through-iap` ; 3) une PR suivante supprime
# default_ssh. Supprimer default_ssh avant l'étape 2 risque de verrouiller l'équipe dehors.

resource "google_compute_firewall" "default_ssh" {
  name          = "default-allow-ssh"
  network       = "default"
  description   = "Allow SSH from anywhere"
  direction     = "INGRESS"
  priority      = 65534
  source_ranges = ["0.0.0.0/0"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "default_internal" {
  name          = "default-allow-internal"
  network       = "default"
  description   = "Allow internal traffic on the default network"
  direction     = "INGRESS"
  priority      = 65534
  source_ranges = ["10.128.0.0/9"]

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }
}

resource "google_compute_firewall" "default_icmp" {
  name          = "default-allow-icmp"
  network       = "default"
  description   = "Allow ICMP from anywhere"
  direction     = "INGRESS"
  priority      = 65534
  source_ranges = ["0.0.0.0/0"]

  allow {
    protocol = "icmp"
  }
}

# L'API IAP est nécessaire au tunnel SSH. `disable_on_destroy = false` : retirer cette ressource du code
# ne doit pas couper l'API pour tout le projet.
resource "google_project_service" "iap" {
  service            = "iap.googleapis.com"
  disable_on_destroy = false
}

# SSH depuis les seules adresses d'IAP (plage publiée par Google).
resource "google_compute_firewall" "ssh_iap" {
  name          = "chatisen-ssh-iap"
  network       = "default"
  description   = "SSH through Identity-Aware Proxy only"
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["chatisen"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  depends_on = [google_project_service.iap]
}
