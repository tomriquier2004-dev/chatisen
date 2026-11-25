# ADR-0018 : Infrastructure as code avec Terraform et load balancer réseau GCP

- **Statut** : proposé
- **Date** : 2026-11-25
- **Auteur (domaine)** : Sha (infra)
- **Relecteur (autre domaine)** : Tom (Flex)
- **Exigences concernées** : NFR-02, NFR-03, NFR-07

> Numéro 0018 : le 0015 est réservé à Tom (seuils de blocage du pipeline de sécurité) et le 0017 au brouillon « base de données hors de la VM » (Theo). Cet ADR traite l'issue #129. Il concerne la **vue cible** du § 8.3 de [`architecture.md`](../architecture.md) ; la vue J1 (27 novembre) reste faite à la main, comme décrit dans [`infra/README.md`](../../infra/README.md).

## Contexte

- Toutes les ressources GCP (projet, VM, IP statique, règles de pare-feu, compte de service, calendrier d'arrêt) ont été créées à la main, avec `gcloud` et la console ([ADR-0012](0012-deploiement-et-hebergement.md)). NFR-07 demande un déploiement reproductible : une configuration faite à la main n'est ni relue en pull request ni rejouable.
- La vue cible ajoute des ressources : un load balancer, une VM TURN séparée (à confirmer avec le prof et Tom), des règles de pare-feu pour IAP et les sondes de santé, et peut-être Cloud NAT.
- Le 25 novembre 2026, l'équipe a décidé d'utiliser **le load balancer de GCP** et **Terraform**. Cet ADR consigne ces choix, leur coût et leurs limites.
- Selon le prof (relayé par Theo, § 8.3), coturn consomme beaucoup et peut geler Caddy : d'où l'idée d'une VM TURN séparée, qui reste **à confirmer** et que cet ADR n'engage pas.

## Options considérées

**Description de l'infrastructure**

1. **Continuer à la main** (commandes `gcloud` documentées dans `infra/README.md`) — rien à installer, mais ni relecture, ni état connu, ni détection des écarts.
2. **Terraform** (fournisseur Google) — description déclarative relue en pull request, `plan` avant chaque changement, `import` des ressources existantes, destruction ciblée d'une ressource. Un état à protéger et un outil de plus à installer.
3. **Pulumi** (TypeScript, comme le reste du dépôt) — non évalué.

**Load balancer** (tarifs lus en novembre 2026 sur la page [Tarifs du réseau](https://cloud.google.com/vpc/network-pricing#cloud-load-balancing), en dollars ; les types sont décrits d'après la connaissance générale de GCP, à confirmer dans la documentation)

- **A. Load balancer réseau passthrough externe** — transmet le TCP (web) et l'UDP (TURN) sur une même IP statique, sans terminer le TLS.
- **B. Load balancer d'application externe** — HTTP(S) seulement : inutilisable pour TURN.
- **C. Load balancer réseau proxy** — TCP seulement : pas d'UDP.
- **D. Aucun load balancer** — une IP statique propre à la VM TURN et un nom `turn.dc-ops.isen.fedyna.fr` (sous-domaine à demander au prof). Moins cher, mais pas de façade unique ni de sondes de santé.

Tarifs relevés : règles de transfert, les cinq premières, 0,025 $ par heure (je lis ce tarif comme couvrant l'ensemble des cinq premières règles, à confirmer dans le calculateur), puis 0,01 $ par heure et par règle ; données traitées 0,008 $ par Gio en entrée et autant en sortie ; IP statique attribuée à une règle de transfert : sans frais. La région `europe-west1` figure dans la liste du tableau. La page ne propose **aucun forfait mensuel** : le tarif horaire et le tarif par Gio s'additionnent.

## Décision

1. **Terraform décrit les ressources GCP de la vue cible**, dans `infra/terraform/` (à créer). La vue J1 n'est pas migrée avant le 27 novembre.
2. **Load balancer réseau passthrough externe** (option A) pour la vue cible, avec l'IP statique `chatisen-ip` portée par sa règle de transfert, où elle n'est pas facturée.
3. **Aucun état Terraform, secret ni identifiant en clair dans le dépôt** (il est public) : `.gitignore` exclut déjà `*.tfstate` et `.terraform/` ; les valeurs propres au projet passent par des variables.
4. **Points ouverts, à trancher avant le premier `apply`** : emplacement de l'état (bucket GCS ou fichier local), import des ressources créées à la main ou recréation, authentification de la CI.

## Conséquences

- **Coût fixe** : environ 0,60 $ par jour (18 $ pour 720 heures) pour la règle de transfert. Il court **VM éteintes** : la règle « éteinte, la VM ne coûte que son disque et son IP » de `infra/README.md` ne vaut plus tant que le load balancer existe. Le traitement des données n'égalerait ce coût fixe qu'au-delà d'environ 1 100 Gio par mois. Jusqu'au 11 décembre, l'ordre de grandeur est de 9 $, à relever dans le rapport de facturation.
- **La durée est le levier** : avec Terraform, le load balancer pourrait n'exister que pendant les mesures et les répétitions. Pratique **à valider**, car chaque création déplace l'IP statique.
- **Bascule de l'IP** : l'IP, aujourd'hui attachée à la VM, doit être détachée avant d'être attribuée à la règle de transfert, ce qui interrompt le HTTPS et TURN le temps de la bascule. À faire hors d'une répétition de démo.
- **Une IP statique réservée mais attribuée à rien coûte 0,01 $ par heure**, le double d'une IP sur VM (0,005 $ par heure) : la configuration doit la laisser toujours attribuée.
- **Hypothèse à mesurer** : coturn derrière un load balancer passthrough. Les paquets relayés doivent porter l'adresse du load balancer comme source ; derrière Cloud NAT, ils porteraient celle de la passerelle et pourraient être ignorés par le pair. À vérifier avec un appel relayé ; en cas d'échec, l'option D reste ouverte.
- **L'état Terraform est sensible** et sa perte oblige à tout réimporter. Une modification faite à la main (`gcloud`, console) crée un écart avec le code : une fois Terraform adopté, les changements passent par pull request.
- **La CI ne doit pas détenir de clé de compte de service durable** (règle de `infra/README.md`) ; le mécanisme d'authentification reste à concevoir.
- **Cet ADR n'engage ni la VM TURN séparée, ni la base chez Supabase** (ADR-0017) : ces deux points attendent l'avis du prof et de Tom.
- **À revoir** si le test coturn échoue, si le coût devient un problème, ou si le prof refuse la séparation de coturn.

## À vérifier avant de passer à « accepté »

- [ ] Un appel relayé par TURN passe, coturn étant derrière le load balancer.
- [ ] Emplacement de l'état Terraform décidé et documenté.
- [ ] Ressources existantes importées, `terraform plan` sans changement.
- [ ] Bascule de l'IP testée, durée de l'interruption mesurée.
- [ ] Coût du load balancer relevé dans le rapport de facturation et joint au chapitre 12.
- [ ] Règle d'extinction de `infra/README.md` corrigée au moment où le load balancer est créé.
- [ ] Avis du prof et de Tom sur la VM TURN séparée.
