# Équipe, rôles et règles

## Principe : « you build it, you run it »

Le projet est noté sur le **DevOps** : infrastructure, CI/CD, exploitation. Ces sujets ne sont donc pas réservés à une seule personne.

- **Une responsabilité de plateforme** (Infra) : elle fournit la base commune et aide les autres.
- **Une pratique DevOps pour tous** : chacun livre sa tranche **de bout en bout** — code, tests, jobs CI, déploiement, dashboard, alertes, runbook.
- **Une astreinte tournante** pour que tout le monde touche l'exploitation.
- **Pas de point unique de défaillance** : au moins deux personnes savent déployer et débloquer la CI.

## Affectation

| Rôle | Domaine | Personne |
| --- | --- | --- |
| **Infra** | Lead plateforme : Compose/k3s, IaC, registry, secrets, stack d'observabilité, modèles de pipeline | Sha (@Shamina934), lead infra |
| **Dev Messagerie** | Auth, utilisateurs, conversations, messages temps réel, historique, reprise de connexion — back **et** front | Theo (@theocb13) |
| **Dev Appels** | Signalisation WebRTC, écrans d'appel, micro/caméra, partage d'écran, qualité d'appel, coturn — back **et** front | Mathys (@MathysGbs) |
| **Flex** | Chef de projet, releases, sécurité du pipeline, plan d'urgence, joker | Tom (@tomriquier2004-dev), chef de projet |

## Périmètres

### Infra — lead plateforme
- Environnements (dev / staging / prod), hébergement, registry, gestion des secrets, infrastructure as code.
- Modèles de pipeline réutilisables par les autres (lint, tests, build, scan, déploiement) ; Compose, puis k3s (réplicas, déploiements progressifs) si retenu par ADR.
- Stack Prometheus / Grafana / Loki, règles d'alerte de la plateforme.
- Tests de charge (k6), mesure des ressources et optimisation.
- Rôle de coach : il aide les autres à écrire *leurs* jobs, dashboards et alertes plutôt que de tout faire à leur place.

### Dev Messagerie — tranche « messagerie », de bout en bout
- **Code** : API REST (auth, users, conversations), modèle de données, Socket.IO (rooms, présence, accusés), historique, reprise de connexion, UI correspondante.
- **DevOps** : jobs CI de sa tranche (tests unitaires, e2e Playwright), migrations Postgres dans le pipeline, sauvegarde et restauration de la base (avec un test de restauration), dashboard et alertes (messages/s, latence d'ack, erreurs).
- Livre en premier les **contrats** (`packages/shared`) : l'auth bloque tout le monde.

### Dev Appels — tranche « appels », de bout en bout
- **Code** : signalisation WebRTC, `getUserMedia` / `RTCPeerConnection` / ICE, partage d'écran, indicateurs de qualité (`getStats()`), UI des appels.
- **DevOps** : déploiement et configuration de coturn (identifiants éphémères, ports, durcissement), tests de dégradation réseau (`tc netem`) et de panne, dashboard de qualité d'appel et alertes.
- **Data & IA** : collecte des échantillons de qualité, analyse, PoC de détection d'anomalie, évalué avec une métrique.

### Flex — chef de projet
- **Pilotage** (~4 h/semaine) : board, point hebdo, interface unique avec l'encadrant, scope freeze, registre des risques.
- **Releases** : versionnement, tags, changelog, **exercice de rollback**.
- **Sécurité du pipeline** : Semgrep, Trivy, OWASP ZAP, scan de secrets, Dependabot — les contrôles et leurs seuils de blocage.
- **Plan d'urgence** : runbooks d'incident, post-mortems, **métriques DORA** (fréquence de déploiement, délai de livraison, taux d'échec, temps de rétablissement).
- **Documents** : assemblage de la spécification, registre des ADR, démonstration.
- **Joker** : renforce le domaine en retard.

## Astreinte tournante (« ops de la semaine »)

Chaque semaine, une personne différente : surveille les alertes, gère les déploiements, traite les incidents et rédige un **post-mortem** court pour chacun. La rotation est ici voulue (elle force chacun à toucher l'exploitation) ; elle ne s'applique **pas** à la propriété des livrables, qui restent nominatifs.

## Sécurité : un travail commun, un responsable de livrable

Le briefing demande de **tester** les faiblesses et d'énoncer les **limites**. **Flex** est responsable du livrable 5 (modèle de menaces, exigences `SEC-xx`, rapport, suivi des correctifs). Il n'implémente pas tout : chacun sécurise sa tranche.

| Rôle | Sécurité portée |
| --- | --- |
| Dev Messagerie | Argon2id, JWT court + refresh rotatif, contrôle d'accès aux conversations (dont retrait d'un membre connecté), validation des entrées, rate limiting, XSS dans les messages |
| Dev Appels | Identifiants TURN éphémères, autorisation de la signalisation et de l'envoi des stats d'appel, permissions média, abus de relais |
| Infra | Secrets, TLS, isolement réseau, scan d'images, durcissement des hôtes |
| Flex | Atelier STRIDE à 4 en phase 0, contrôles du pipeline, tests offensifs, rapport avec limites |

Rituels : atelier de menaces à 4 en phase 0 ; revue sécurité à 4 avant le scope freeze ; toute PR touchant auth / accès / données reçoit une relecture sécurité d'un autre domaine.

## Règles

- **Décisions** : le domaine owner décide dans son domaine. Désaccord entre deux domaines → le Project Owner (Flex) arbitre. S'il est partie prenante → les deux autres tranchent à la majorité.
- **Désengagement** : si quelqu'un décroche, le Project Owner le dit à l'équipe dès la semaine 2, puis à l'encadrant si cela ne se règle pas.
- **Propriétaire de livrable** : responsable que ce soit écrit, pas obligé de tout écrire.

## Rituels

- Stand-up asynchrone écrit quotidien (3 lignes : fait / aujourd'hui / bloqué).
- Point hebdomadaire de 45 min : démo → statut des 10 livrables → arbitrage de scope → risques → bilan de l'astreinte.
- Revue de code croisée obligatoire (1 approbation d'un autre domaine).
- Scope freeze à mi-parcours : on arrête d'ajouter des features, on mesure et on écrit.
