# Planning jusqu'à la soutenance

> Statut : **proposition à valider par l'équipe** (issue #20).
> Source des contraintes : réponses de l'encadrant consignées dans `docs/prof-qa.md` (PR #19). L'heure de la soutenance n'est pas connue.

## Contraintes connues

| Contrainte | Conséquence |
| --- | --- |
| Soutenance **vendredi 11 décembre 2026**, soit ~18 jours (15 jours ouvrés) depuis le lundi 23 novembre | Plus de place pour des phases longues : un squelette déployé la première semaine, puis on empile |
| **Core uniquement**, « on verra par la suite » pour les extensions | Conférences, partage de fichiers/d'écran, k3s, contrôle d'accès avancé : **suspendus** |
| **Les 6 axes d'investigation sont obligatoires**, « tout au long du développement » | On mesure dès que quelque chose tourne, pas à la fin |
| **Notes individuelles et collective** | Chacun a des contributions visibles et nominatives (issues, PR, axes) |
| **Auto-hébergement** | Un hôte à nous avec IP publique et ports UDP ouverts pour coturn (voir risque R10) |
| Grille, démo et réseau de la salle : non définis | À redemander (voir « Questions ouvertes ») |

## Périmètre figé

**Core (obligatoire)** : authentification et utilisateurs · messagerie privée et de groupe · temps réel + historique · appel voix 1-1 · appel vidéo 1-1 · déploiement et monitoring de base.

**Ajouts retenus car ils servent les axes obligatoires** (faible coût, données déjà produites) : indicateurs de qualité d'appel (`getStats`, FR-13) pour l'analyse de la qualité et l'IA ; reprise de connexion minimale (FR-17) pour les tests de fiabilité.

**Suspendu** : conférence multi-participants (FR-12), partage de fichiers (FR-14), partage d'écran (FR-15), k3s (issue #11), espace d'administration. Décision de rouvrir l'un d'eux : seulement après le jalon J3, et seulement si le Core et les mesures sont déjà en avance.

## Jalons

| Jalon | Date | Ce qui doit être vrai |
| --- | --- | --- |
| **J0** | lun 23 → mar 24 nov | Contrats publiés dans `packages/shared` · squelettes `apps/web` et `apps/api` · ADR socle ouverts · hébergement choisi (issue #10) |
| **J1** | **ven 27 nov** | **Squelette déployé** : CI complète (lint, tests, Semgrep, build, Trivy), Compose sur l'hôte, inscription/connexion, envoi et réception d'un message en temps réel avec historique, Prometheus + Grafana de base |
| **J2** | **mer 2 déc** | Messagerie Core complète (groupes, reprise de connexion minimale) · coturn déployé · **appel voix 1-1** qui passe par TURN |
| **J3** | **ven 4 déc** | **Core complet** (vidéo 1-1, micro/caméra) · **scope freeze** · échantillons de qualité collectés · premiers rapports de mesure |
| **J4** | **lun 7 déc** | **Mesures terminées** pour les 6 axes, rapports dans `docs/reports/` avec méthode et limites |
| **J5** | **mar 8 déc** | **Gel du code** · rapport assemblé (13 chapitres, en français) |
| Répétitions | mer 9 et jeu 10 déc | 2 répétitions de la démo en conditions réelles · enregistrement vidéo de secours · TURN testé depuis le réseau de la salle si accessible |
| **Soutenance** | **ven 11 déc** | — |

Les mesures démarrent avant J4 : les scripts de charge et de sécurité sont écrits pendant la semaine 1 et lancés dès que la messagerie tourne (J1-J2), le jeu de données de qualité avec dégradation réseau (`tc netem`) est produit à partir de J2.

## Axes d'investigation — responsables proposés

Chaque membre porte au moins un axe, ce qui rend les contributions individuelles visibles. À valider ; une fois validés, une issue assignée par axe.

| Axe du briefing | Responsable | Appui | Livrable | Échéance |
| --- | --- | --- | --- | --- |
| Tests de performance et de charge | Sha | Theo | 6 | 7 déc |
| Analyse de la qualité de communication | Mathys | Sha (dégradation réseau) | 8 | 7 déc |
| Optimisation infra et ressources | Sha | Tom | 6 | 7 déc |
| Tests de sécurité | Tom | chacun sur sa tranche | 5 | 7 déc |
| Analyse de données (usage et opérations) | Theo | Mathys | 8 | 7 déc |
| Feature / PoC IA | Mathys | Theo | 8 | 7 déc |

**PoC IA volontairement simple** : détection d'anomalie sur latence/jitter/perte (seuil statistique type z-score ou EWMA), évaluée avec précision et rappel sur le jeu de données dégradé par `netem`. Un modèle plus complexe n'est pas nécessaire pour répondre à « résultats mesurés ».

## Ordre de sacrifice si on prend du retard

À ne **jamais** sacrifier : Core · déploiement reproductible + monitoring · chaque axe à une profondeur minimale **mesurée** (avec limites énoncées) · démo + plan B.

À sacrifier **d'abord**, dans cet ordre : finitions d'interface du design system (implémenter le minimum) → profondeur des ADR (courts, mais écrits) → reprise de connexion au-delà du minimum → statistiques d'usage détaillées.

## Rythme

- Stand-up écrit quotidien (3 lignes) ; point hebdomadaire de 45 min **le lundi et le jeudi** pendant ces 3 semaines.
- PR courtes, une approbation d'un autre membre, merge le jour même.
- Astreinte tournante à partir de J1 (chaque membre déploie et traite les alertes à son tour).

## Questions ouvertes

1. **Auto-hébergement** : machine d'un membre, ou serveur loué ? TURN exige une IP publique et des ports UDP joignables (issue #10).
2. Grille de notation et poids des 10 livrables.
3. Durée de la démo, présence d'internet et filtrage UDP dans la salle, heure de la soutenance.
4. Les 6 axes sont-ils attendus avec la même profondeur ?
