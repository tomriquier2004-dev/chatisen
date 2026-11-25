# ADR-0012 : Déploiement (Compose) et hébergement (Google Cloud, Compute Engine)

- **Statut** : proposé
- **Date** : 2026-11-23
- **Auteur (domaine)** : Sha (infra)
- **Relecteur (autre domaine)** : Tom (Flex)
- **Exigences concernées** : NFR-02, NFR-03, NFR-06, NFR-07 ; FR-09, FR-10 (coturn exige une IP publique et des ports UDP joignables)

> Numéro 0012 : réservé par le § 12 de [`architecture.md`](../architecture.md) (« Déploiement : Compose vs Kubernetes ; hébergement »). Cet ADR couvre aussi l'issue #11 pour la partie Compose / k3s.

## Contexte

- Soutenance le **11 décembre 2026**. Le jalon **J1 (27 novembre)** exige un squelette déployé : Compose sur un hôte, CI complète, Prometheus + Grafana de base. Le jalon J2 (2 décembre) exige coturn avec un appel voix qui passe par TURN. L'hébergement est donc sur le chemin critique dès J0 (issue #10, risque R10).
- Réponse de l'encadrant ([`prof-qa.md`](../prof-qa.md), question 4) : hébergement sur le **free tier d'un fournisseur cloud**, Oracle Cloud étant cité. L'inscription Oracle est restée bloquée (incident à la création du compte, en attente du support) ; l'équipe passe à **Google Cloud (GCP)**, plus simple à obtenir. Ce changement de fournisseur doit être communiqué à l'encadrant par Tom.
- Domaine fourni : `dc-ops.isen.fedyna.fr`, TTL 15 min. Il pointait vers `8.8.8.8` (valeur provisoire) jusqu'à ce que l'encadrant le redirige vers l'IP statique du projet : la résolution vers l'IP de la VM est vérifiée depuis le 25 novembre 2026 ([rapport](../reports/ports-tls-2026-11-25.md)). Un seul nom d'hôte est utilisé ([ADR-0016](0016-point-d-entree-caddy-et-ports-turn.md)) ; des sous-domaines `turn.` et `grafana.` ont été demandés à l'encadrant avant cet ADR et ne sont pas utilisés dans l'architecture actuelle (l'encadrant crée les sous-domaines un par un, sans wildcard).
- Périmètre figé par [`planning.md`](../planning.md) : Core uniquement, k3s et conférences suspendus.
- Contraintes techniques : TURN a besoin d'une IP publique fixe et de ports UDP ouverts ; les sauvegardes (RPO 6 h) ont besoin d'une copie hors de l'hôte (issue #42) ; l'ensemble des services Compose (API, client, PostgreSQL, Redis, coturn, Prometheus, Grafana, Loki, sauvegardes) doit tenir sur un seul hôte.

## Options considérées

**Hébergement**

1. **Google Cloud, Compute Engine (VM x86_64)** — création du compte et de la VM en quelques minutes, IP externe statique réservable, pare-feu réseau (VPC) simple, architecture **amd64** (pas d'image ARM à construire). Points à vérifier : le niveau gratuit permanent (type `e2-micro`, 1 Go de RAM, régions limitées) est **trop petit** pour cette pile, donc la VM sera facturée, soit sur le **crédit d'essai** du compte s'il est disponible, soit sur un budget de l'équipe ; le trafic sortant (dont le relais TURN) est facturé ; un moyen de paiement est demandé à l'ouverture du compte.
2. **Oracle Cloud Always Free (Ampere A1, ARM64)** — gratuit et conforme à la réponse initiale de l'encadrant, mais **inscription bloquée**, capacité A1 parfois indisponible, images à construire pour ARM64. **Écartée** : le délai de déblocage menace J1.
3. **VPS loué chez un autre fournisseur** — disponible vite, coût partagé à quatre. Conservé comme **plan B** si GCP est inutilisable.
4. **Machine d'un membre** — IP publique instable, ports UDP rarement joignables, disponibilité liée à un poste personnel. Matérialise le risque R10. **Écartée.**

**Orchestration**

A. **Docker Compose sur un hôte unique** — reproductible, versionné, suffisant pour le Core, rapide à mettre en place avant J1.
B. **k3s** — réplicas, déploiements progressifs ; suspendu par le planning (issue #11) : coût de mise en place et d'exploitation incompatible avec 18 jours.

## Décision

1. **Compose sur un hôte unique** (option A). k3s reste suspendu ; il ne sera rouvert qu'après J3 et seulement si le Core et les mesures sont en avance.
2. **Hébergement : Google Cloud, une VM Compute Engine** (option 1), avec une **IP externe statique réservée**, attachée à la VM (une IP éphémère change si la VM est recréée et obligerait à refaire demander les sous-domaines).
   - **Réalisé le 23 novembre 2026** : projet GCP `chatisen`, région `europe-west1` (Belgique, choisie pour la latence depuis l'Europe), zone `europe-west1-b`, VM `chatisen-prod`, type `e2-standard-2` (2 vCPU, 8 Go de RAM), Debian 12 en **amd64**, disque de 40 Go `pd-balanced`, IP externe statique `chatisen-ip` attachée, étiquette réseau `chatisen`, OS Login activé.
   - Le dimensionnement (2 vCPU, 8 Go) est une **hypothèse** à confirmer par la mesure de la consommation de la pile, pas un résultat.
   - Docker Engine et Docker Compose installés sur la VM ; `docker run hello-world` réussi.
   - **Pare-feu VPC** : règle `chatisen-web` (tcp 80 et 443) et règle `chatisen-turn` (tcp 3478, udp 3478, tcp 5349, udp 49152-49252), toutes deux ciblées par l'étiquette `chatisen`.
   - **Alerte de budget** : 135 € (la moitié du crédit de 269 €), avec des seuils à 25, 50, 75 et 90 % sur les dépenses réelles. Une alerte prévient, elle ne coupe rien.
   - **Accès partagé** : voir le point 7.
3. **Images en `linux/amd64` seulement.** Pas de build multi-architecture tant que l'hôte reste x86 ; à rouvrir si l'hôte devient ARM (plan B ou VM ARM).
4. **Plan B : un VPS loué** (option 3), qui reprendrait le même Compose si GCP devenait inutilisable (crédit épuisé, compte suspendu). Il n'est **pas préparé** à ce stade : le déclencheur prévu initialement (fin de J0) est caduc puisque la VM GCP existe.
5. **Réseau et DNS** :
   - **un seul nom d'hôte**, `dc-ops.isen.fedyna.fr`, sans sous-domaine ([ADR-0016](0016-point-d-entree-caddy-et-ports-turn.md)) : `/api` et `/socket.io` vont vers l'API, le reste est servi par Caddy ;
   - certificat TLS pour ce nom (défi HTTP-01, sans wildcard) ;
   - coturn est joignable sur la même IP, sur ses propres ports (vue J1) ; il n'est pas derrière Caddy ;
   - ports ouverts par des **règles de pare-feu VPC** ciblées par étiquette réseau : 22 (clé SSH uniquement ; ouvert à Internet aujourd'hui, à restreindre par IAP, voir `infra/README.md`), 80 et 443 (TCP), 3478 (UDP et TCP), 5349 (TCP, ouvert sans service, à fermer), plage UDP de relais 49152-49252 (ADR-0016). Aucun port de base de données ni de métriques n'est exposé à Internet.
6. **Reproductibilité** : le déploiement est décrit par des fichiers versionnés dans `infra/` (issue #12) ; aucune étape manuelle non documentée. Les secrets sont dans les GitHub Environments et dans un fichier `.env` hors dépôt sur l'hôte (`chmod 600`).
7. **Exploitation et maîtrise des coûts** :
   - **Rôles** : Sha (infra) est administratrice principale ; Tom (binôme CI/déploiement, [`team.md`](../team.md)) est second administrateur, avec l'administration IAM. Theo et Mathys ont les rôles « Administrateur d'instances Compute (v1) » et « Connexion au système d'exploitation Compute » : ils peuvent démarrer, arrêter et se connecter en SSH, sans rôle d'administration IAM.
   - **Règle d'extinction** : celui qui démarre la VM l'arrête en fin de session ; l'astreinte de la semaine vérifie chaque soir qu'elle est éteinte.
   - **Filet de sécurité** : un calendrier d'instance `arret-nuit-minuit` (région `europe-west1`) arrête la VM chaque jour à 00h00, heure de Paris.
   - **Le compte reste en essai gratuit** : ne pas le mettre à niveau vers un compte de facturation payant.
   - Les adresses des membres de l'équipe et l'identifiant exact du projet ne sont pas consignés dans le dépôt (public).

## Conséquences

- **Point unique de défaillance assumé** : un seul hôte, donc pas de haute disponibilité. NFR-02 (scalabilité) et NFR-03 (disponibilité) sont traitées par la **mesure** (test de point de rupture d'une instance, scénarios de panne et de redémarrage, restauration testée), pas par la redondance. Cette limite est énoncée dans le rapport.
- **Le test de charge se mesure sur une instance sans scalabilité.** Le générateur de charge tourne **hors** de l'hôte testé, sinon il fausse la mesure. Le trafic sortant de ces tests est facturé : il entre dans le budget.
- **Coût et crédit** : le compte dispose de **269 € de crédit, valables 90 jours (jusqu'au 22 février 2027)**, soit au-delà de la soutenance du 11 décembre. D'après la console GCP, rien n'est facturé pendant l'essai ; à la fin de l'essai (crédit épuisé ou fin de la période) les ressources sont interrompues, sauf passage à un compte payant. L'arrêt de la VM économise le calcul mais **pas le disque ni l'IP statique**, qui restent facturés (sur le crédit). La consommation réelle n'est pas encore connue : elle sera relevée dans les rapports de facturation et jointe au chapitre 12. **Cette règle vaut pour la vue J1** : le load balancer de la vue cible est facturé tant qu'il existe, VM éteintes ou non ([ADR-0018](0018-terraform-et-load-balancer-gcp.md)).
- **Compromis de l'extinction** : une VM éteinte ne fait ni sauvegardes (toutes les 6 h), ni collecte de métriques, ni déploiement par la CI. Pendant les mesures (J2 à J4) et les répétitions de démo, la VM doit être allumée ; le calendrier d'arrêt nocturne est à suspendre ces jours-là si nécessaire.
- **Compte de service par défaut à durcir** : la VM utilise le compte de service Compute Engine par défaut, qui porte le rôle historique « Éditeur ». Un compte de service dédié, sans rôle, limiterait les dégâts en cas de compromission d'un conteneur. À traiter avant J3 (la VM doit être arrêtée pour changer de compte de service).
- **Pare-feu du réseau `default`** : un projet GCP neuf crée normalement des règles génériques (SSH, RDP, ICMP, trafic interne) qui s'appliquent à toutes les instances. Leur présence est **à vérifier** (`gcloud compute firewall-rules list`). Si elle existe, la règle RDP (port 3389) est inutile et doit être supprimée ; SSH ouvert à Internet ne s'appuie que sur OS Login (clé) et est à restreindre (IAP ou plage de sources) avant J3.
- **Sauvegardes** : tant qu'aucune copie hors hôte n'existe (issue #42), la perte de la VM entraîne la perte des sauvegardes avec les données. Un stockage objet GCP dans une autre zone est une piste ; à décider avant J4.
- **Écart avec la réponse de l'encadrant** : il a cité Oracle ; le changement de fournisseur lui est signalé par Tom (consigné dans `prof-qa.md`, qui reste réservé à ses réponses).
- **À revoir** si le crédit GCP n'est pas disponible, si l'encadrant impose un autre hôte, ou si le Core et les mesures sont en avance après J3 (réouverture de k3s).

## Évolution prévue : vue cible

Cet ADR décrit la vue J1 : hôte unique, IP statique attachée à la VM, PostgreSQL et coturn sur la même VM, extinction de la VM pour économiser. La vue cible ([`architecture.md`](../architecture.md) § 8.3) le **modifiera** : IP portée par un load balancer réseau GCP, VM TURN séparée et base chez Supabase (ces deux derniers points sont **à confirmer** avec le prof et Tom), ressources décrites en Terraform. Ces choix sont consignés dans l'[ADR-0018](0018-terraform-et-load-balancer-gcp.md). Tant qu'ils ne sont pas acceptés, cet ADR reste valable pour la vue J1.

## À vérifier avant de passer à « accepté »

- [x] Compte de facturation GCP actif, crédit de 269 € confirmé, alerte de budget en place.
- [x] VM créée (région, type, disque), **IP externe statique réservée** et attachée.
- [x] Un second membre a un accès IAM limité (Tom, administration IAM ; Theo et Mathys, Compute Engine).
- [x] Docker et Compose installés sur la VM, `hello-world` réussi.
- [ ] Ports 80, 443, 3478, 5349 et plage UDP joignables **depuis l'extérieur** (test depuis un réseau tiers).
- [x] Nom d'hôte unique `dc-ops.isen.fedyna.fr` résolu vers l'IP de la VM (aucun sous-domaine nécessaire, ADR-0016).
- [ ] Calendrier d'arrêt nocturne vérifié (la VM s'arrête bien à 00h00).
- [ ] Règle RDP du réseau `default` supprimée ; SSH durci.
- [ ] Compte de service dédié attaché à la VM.
- [ ] Consommation réelle de la pile mesurée, dimensionnement confirmé ou corrigé.
