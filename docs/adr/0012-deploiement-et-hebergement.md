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
- Domaine fourni : `dc-ops.isen.fedyna.fr`, TTL 15 min, qui pointe pour l'instant vers `8.8.8.8` (valeur provisoire). Les sous-domaines sont créés **un par un** par l'encadrant (pas de wildcard), sur communication de l'adresse IP publique du projet.
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
   - Région en Europe, pour la latence depuis la salle de démo (choix exact _à compléter_).
   - Système Debian ou Ubuntu LTS, architecture **amd64**. Dimensionnement de départ : 2 vCPU et 8 Go de RAM, à confirmer par la mesure de la consommation de la pile (il s'agit d'une hypothèse, pas d'un résultat).
   - **Alerte de budget** configurée dès la création du compte de facturation, pour éviter une facture imprévue.
   - **Accès partagé** : au moins un second membre (binôme CI/déploiement, [`team.md`](../team.md)) reçoit un rôle IAM limité à Compute Engine, afin que le compte ne repose pas sur une seule personne.
3. **Images en `linux/amd64` seulement.** Pas de build multi-architecture tant que l'hôte reste x86 ; à rouvrir si l'hôte devient ARM (plan B ou VM ARM).
4. **Plan B décidé d'avance : un VPS loué** (option 3). Déclencheur : **si aucune VM GCP n'est utilisable à la fin de J0 (mardi 24 novembre)**. Fournisseur et prix : _à compléter_. Le plan B est préférable à un retard sur J1, qui entraînerait J2 (coturn) puis tous les axes de mesure.
5. **Réseau et DNS** :
   - sous-domaines à demander **en une seule fois** par Tom : `dc-ops` (client), `api`, `turn`, `grafana` (sous `dc-ops.isen.fedyna.fr`), dès que l'IP externe est connue ;
   - certificats TLS par sous-domaine (défi HTTP-01, sans wildcard) ;
   - `turn` pointe **directement** sur l'hôte, sans proxy HTTP ;
   - ports ouverts par des **règles de pare-feu VPC** ciblées par étiquette réseau : 22 (clé SSH uniquement, source restreinte si possible), 80 et 443 (TCP), 3478 (UDP et TCP), 5349 (TCP), plage UDP de relais **restreinte** (valeur à fixer dans l'ADR-0009). Aucun port de base de données ni de métriques n'est exposé à Internet.
6. **Reproductibilité** : le déploiement est décrit par des fichiers versionnés dans `infra/` (issue #12) ; aucune étape manuelle non documentée. Les secrets sont dans les GitHub Environments et dans un fichier `.env` hors dépôt sur l'hôte (`chmod 600`).

## Conséquences

- **Point unique de défaillance assumé** : un seul hôte, donc pas de haute disponibilité. NFR-02 (scalabilité) et NFR-03 (disponibilité) sont traitées par la **mesure** (test de point de rupture d'une instance, scénarios de panne et de redémarrage, restauration testée), pas par la redondance. Cette limite est énoncée dans le rapport.
- **Le test de charge se mesure sur une instance sans scalabilité.** Le générateur de charge tourne **hors** de l'hôte testé, sinon il fausse la mesure. Le trafic sortant de ces tests est facturé : il entre dans le budget.
- **Coût réel** : contrairement à l'hypothèse « free tier », l'hébergement a un coût. Le crédit d'essai doit couvrir la période jusqu'au 11 décembre avec une marge ; à vérifier à l'ouverture du compte, avant d'accepter cet ADR.
- **Sauvegardes** : tant qu'aucune copie hors hôte n'existe (issue #42), la perte de la VM entraîne la perte des sauvegardes avec les données. Un stockage objet GCP dans une autre zone est une piste ; à décider avant J4.
- **Écart avec la réponse de l'encadrant** : il a cité Oracle ; le changement de fournisseur lui est signalé par Tom (consigné dans `prof-qa.md`, qui reste réservé à ses réponses).
- **À revoir** si le crédit GCP n'est pas disponible, si l'encadrant impose un autre hôte, ou si le Core et les mesures sont en avance après J3 (réouverture de k3s).

## À vérifier avant de passer à « accepté »

- [ ] Compte de facturation GCP actif, crédit ou budget confirmé, alerte de budget en place.
- [ ] VM créée (région, type, disque), **IP externe statique réservée** et attachée.
- [ ] Un second membre a un accès IAM limité à Compute Engine.
- [ ] Ports 80, 443, 3478, 5349 et plage UDP joignables **depuis l'extérieur** (test depuis un réseau tiers).
- [ ] Sous-domaines créés par l'encadrant et résolus vers l'IP.
- [ ] Consommation réelle de la pile mesurée, dimensionnement confirmé ou corrigé.
- [ ] Plan B : fournisseur choisi et budget validé par l'équipe.
