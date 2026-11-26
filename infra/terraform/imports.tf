# Ressources créées à la main le 23 novembre 2026 (ADR-0012), reprises par Terraform sans être recréées.
# Première fois : `terraform plan -generate-config-out=generated.tf` écrit leur configuration, à relire puis renommer
# en compute.tf (voir README.md). Un import ne modifie rien sur GCP : `apply` n'écrit que l'état.

import {
  to = google_compute_instance.web
  id = "projects/${var.project_id}/zones/${var.zone}/instances/chatisen-prod"
}

import {
  to = google_compute_address.web
  id = "projects/${var.project_id}/regions/${var.region}/addresses/chatisen-ip"
}

import {
  to = google_compute_firewall.web
  id = "projects/${var.project_id}/global/firewalls/chatisen-web"
}

import {
  to = google_compute_firewall.turn
  id = "projects/${var.project_id}/global/firewalls/chatisen-turn"
}

import {
  to = google_compute_resource_policy.nightly_stop
  id = "projects/${var.project_id}/regions/${var.region}/resourcePolicies/arret-nuit-minuit"
}
