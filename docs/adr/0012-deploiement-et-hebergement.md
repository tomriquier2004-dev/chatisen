# ADR-0012 : Déploiement (Compose) et hébergement (Oracle Cloud Free Tier, plan B loué)

- **Statut** : proposé
- **Date** : 2026-11-23
- **Auteur (domaine)** : Sha (infra)
- **Relecteur (autre domaine)** : Tom (Flex)
- **Exigences concernées** : NFR-02, NFR-03, NFR-06, NFR-07 ; FR-09, FR-10 (coturn exige une IP publique et des ports UDP joignables)

> Numéro 0012 : réservé par le § 12 de [`architecture.md`](../architecture.md) (« Déploiement : Compose vs Kubernetes ; hébergement »).

## Contexte

- Soutenance le **11 décembre 2026**. Le jalon **J1 (27 novembre)** exige un squelette déployé : Compose sur un hôte, CI complète, Prometheus + Grafana de base. Le jalon J2 (2 décembre) exige coturn avec un appel voix qui passe par TURN. L'hébergement est donc sur le chemin critique dès J0 (issue #10, risque R10).
- Réponse de l'encadrant ([`prof-qa.md`](../prof-qa.md), question 4) : hébergement sur le **free tier d'un fournisseur cloud, Oracle Cloud**. L'inscription est **en attente** : un incident à la création du compte est en cours de traitement par le support Oracle.
- Domaine fourni : `dc-ops.isen.fedyna.fr`, TTL 15 min, qui pointe pour l'instant vers `8.8.8.8` (valeur provisoire). Les sous-domaines sont créés **un par un** par l'encadrant (pas de wildcard), sur communication de l'adresse IP publique du projet.
- Périmètre figé par [`planning.md`](../planning.md) : Core uniquement, k3s et conférences suspendus.
- Contraintes techniques : TURN a besoin d'une IP publique fixe et de ports UDP ouverts ; les sauvegardes (RPO 6 h) ont besoin d'une copie hors de l'hôte ; l'image de chaque service doit tourner sur l'architecture CPU de l'hôte.

## Options considérées

**Hébergement**

1. **Oracle Cloud Always Free (VM Ampere A1, ARM64)** — gratuit, IP publique réservable, ressources largement suffisantes pour Compose (à vérifier à la création : jusqu'à 4 vCPU et 24 Go de RAM cumulés sur la ressource A1). Imposé par l'encadrant. Risques : compte pas encore créé ; capacité A1 parfois indisponible dans une région (« out of capacity ») ; politique de récupération des instances Always Free inactives ; **ARM64**, donc images à construire pour cette architecture.
2. **VPS loué** (x86 ou ARM, quelques euros par mois à partager à quatre) — disponible en quelques minutes, IP fixe, ports sous contrôle. Coût réel, et écart par rapport à la consigne de l'encadrant (à lui signaler).
3. **Machine d'un membre** — IP publique instable, derrière une box ou un réseau d'école, ports UDP rarement joignables, disponibilité liée à un poste personnel. Cela matérialise le risque R10. **Écartée.**
4. **VM fournie par l'école** — non proposée par l'encadrant (question 4). Non retenue.

**Orchestration**

A. **Docker Compose sur un hôte unique** — reproductible, versionné, suffisant pour le Core, rapide à mettre en place avant J1.
B. **k3s** — réplicas, déploiements progressifs ; mais suspendu par le planning (issue #11) : coût de mise en place et d'exploitation incompatible avec 18 jours.

## Décision

1. **Compose sur un hôte unique** (option A). k3s reste suspendu ; il ne sera rouvert qu'après J3 et seulement si le Core et les mesures sont en avance.
2. **Hébergement principal : Oracle Cloud Always Free** (option 1), conformément à la consigne de l'encadrant, avec **une IP publique réservée** (une IP éphémère change si la VM est recréée et obligerait à refaire demander les sous-domaines).
3. **Plan B décidé d'avance : un VPS loué** (option 2). Déclencheur : **si aucune VM Oracle n'est utilisable à la fin de J0 (mardi 24 novembre)**, on bascule. Fournisseur et prix : _à compléter_. L'encadrant est informé via Tom (`prof-qa.md`). Le plan B est préférable à un retard sur J1, qui entraînerait J2 (coturn) puis tous les axes de mesure.
4. **Images multi-architecture (`linux/amd64` + `linux/arm64`)** dans le job de build de la CI tant que l'hôte n'est pas définitif : cela rend le passage Oracle ARM ↔ VPS x86 transparent. Un build natif sur runner ARM est préférable à l'émulation QEMU (à mesurer : durée du build).
5. **Réseau et DNS** :
   - sous-domaines à demander **en une seule fois** par Tom : `dc-ops` (client), `api`, `turn`, `grafana` (sous `dc-ops.isen.fedyna.fr`), dès que l'IP publique est connue ;
   - certificats TLS par sous-domaine (défi HTTP-01, sans wildcard) ;
   - `turn` pointe **directement** sur l'hôte, sans proxy HTTP ;
   - ports ouverts : 22 (clé SSH uniquement, source restreinte si possible), 80 et 443 (TCP), 3478 (UDP et TCP), 5349 (TCP), plage UDP de relais **restreinte** (valeur à fixer dans l'ADR-0009) ;
   - sur Oracle, **deux couches de filtrage** à ouvrir : règles réseau du VCN (security list ou NSG) **et** pare-feu de la VM elle-même (à vérifier selon l'image).
6. **Reproductibilité** : le déploiement est décrit par fichiers versionnés dans `infra/` ; aucune étape manuelle non documentée. Les secrets sont dans les GitHub Environments et dans un fichier `.env` hors dépôt sur l'hôte (`chmod 600`).

## Conséquences

- **Point unique de défaillance assumé** : un seul hôte, donc pas de haute disponibilité. NFR-02 (scalabilité) et NFR-03 (disponibilité) sont traitées par la **mesure** (test de point de rupture d'une instance, scénarios de panne et de redémarrage, restauration testée), pas par la redondance. Cette limite est énoncée dans le rapport.
- **Le test de charge se mesure sur une instance sans scalabilité.** Le générateur de charge tourne **hors** de l'hôte testé, sinon il fausse la mesure.
- **Sauvegardes** : tant qu'aucune copie hors hôte n'existe, la panne de la VM perd les sauvegardes avec les données. Une copie distante (stockage objet du fournisseur ou autre emplacement) reste à décider ; à traiter avant J4.
- **Dépendance externe** : le calendrier dépend de l'inscription Oracle, d'où le déclencheur du plan B. Si le plan B est activé, le fournisseur remplace Oracle dans cet ADR (statut « remplacé » ou mise à jour datée).
- **Coût en CI** : le build multi-architecture allonge la chaîne ; à mesurer, et à réduire à une seule architecture dès que l'hôte est figé.
- **À revoir** si l'encadrant fournit un autre hôte, si Oracle refuse le compte, ou si le Core et les mesures sont en avance après J3 (réouverture de k3s).

## À vérifier avant de passer à « accepté »

- [ ] Compte Oracle actif, région choisie, VM créée, **IP publique réservée** et notée (hors dépôt si elle est sensible).
- [ ] Capacité réelle obtenue (vCPU, RAM, disque) et architecture confirmée (ARM64).
- [ ] Ports 80, 443, 3478, 5349 et plage UDP joignables **depuis l'extérieur** (test depuis un réseau tiers).
- [ ] Sous-domaines créés par l'encadrant et résolus vers l'IP.
- [ ] Plan B : fournisseur choisi et budget validé par l'équipe.
