# Compte de service dédié de la VM web, créé à la main (inventaire du 26/11/2026). Ses rôles ne sont pas
# encore décrits ici : ils seront ajoutés, un par un, avec Cloud SQL et le bucket de sauvegardes (ADR-0021).
resource "google_service_account" "vm" {
  account_id = "chatisen-vm"

  lifecycle {
    # Le nom affiché et la description saisis à la main ne sont pas connus du dépôt : ne pas les écraser.
    ignore_changes = [display_name, description]
  }
}

# Connexion de la VM à Cloud SQL par le Cloud SQL Auth Proxy (ADR-0021).
resource "google_project_iam_member" "vm_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.vm.email}"
}
