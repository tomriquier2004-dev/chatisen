# Équipe, rôles et règles

## Affectation (à compléter)

| Rôle | Domaine | Casquette de gestion | Personne |
| --- | --- | --- | --- |
| A | Backend & Temps réel | Architecture Owner (livrables 1 & 2) | _à définir_ |
| B | Frontend & Média (WebRTC) | Report & Demo Owner (livrables 9 & 10) | _à définir_ |
| C | Infra, CI/CD & Observabilité | **Project Owner** (processus, planning, interface encadrant) | _à définir_ |
| D | Sécurité, Data, IA & Performance | Evidence Owner (livrables 4, 5, 6, 8) | _à définir_ |

## Périmètres techniques

- **A — Realtime & Core Services** : API REST (auth, users, conversations), modèle de données, Socket.IO serveur, signalisation WebRTC, reprise de connexion, scalabilité horizontale.
- **B — Client & WebRTC** : UI, état client, `getUserMedia` / `RTCPeerConnection` / ICE, partage d'écran, indicateurs de qualité (`getStats()`).
- **C — Platform** : Dockerfiles, Compose, GitHub Actions, registry, coturn, Prometheus/Grafana/Loki, runbooks, rollback.
- **D — Assurance** : modèle de menaces, tests offensifs, tests de charge, analyse de données, PoC IA, stratégie de test.

## Responsabilités du Project Owner (~4 h/semaine)

1. Tenir le board GitHub (10 livrables en milestones, exigences en issues).
2. Animer le point hebdomadaire de 45 min : démo → statut des 10 livrables → arbitrage de scope → risques.
3. Être l'interface unique avec l'encadrant ; tout consigner dans [`prof-qa.md`](prof-qa.md).
4. Décider du scope freeze et savoir dire non.
5. Tenir le [registre des risques](risks.md).

Il n'assigne pas le travail technique : chaque domaine owner décide comment il fait son domaine.

## Règles

- **Décisions** : le domaine owner décide dans son domaine. Désaccord entre deux domaines → le Project Owner arbitre. S'il est partie prenante → les deux autres tranchent à la majorité.
- **Désengagement** : si quelqu'un décroche, le Project Owner le dit à l'équipe dès la semaine 2, puis à l'encadrant si cela ne se règle pas.
- **Propriétaire de livrable** : responsable que ce soit écrit, pas obligé de tout écrire.

## Rituels

- Stand-up asynchrone écrit quotidien (3 lignes : fait / aujourd'hui / bloqué).
- Point hebdomadaire de 45 min.
- Revue de code croisée obligatoire (1 approbation d'un autre domaine).
- Scope freeze à mi-parcours : on arrête d'ajouter des features, on mesure et on écrit.
