# Suivi des livrables

Un seul tableau, relu à chaque point hebdomadaire. **Pas de preuve = pas fini.**

Statut : 🔴 non démarré · 🟠 en cours · 🟢 terminé et prouvé

| # | Livrable | Propriétaire | Contributeurs | Statut | Preuve (chemin) |
| --- | --- | --- | --- | --- | --- |
| 1 | Specification | Flex (assemblage) | toute l'équipe en phase 0 ; architecture dans `docs/architecture.md` | 🔴 | `docs/requirements/`, `docs/architecture.md` |
| 2 | Justification (ADR) | Flex (registre) | chacun écrit les ADR de son domaine, un autre relit | 🔴 | `docs/adr/` |
| 3 | Application + déploiement reproductible | Infra (plateforme, déploiement) | Dev Messagerie (messagerie), Dev Appels (appels, coturn) | 🔴 | `apps/`, `infra/` |
| 4 | Tests (automatisés + rapports) | Dev Messagerie (stratégie, e2e, rapport) | chacun teste sa tranche | 🔴 | `docs/reports/` |
| 5 | Security (analyse + validation) | Flex | toute l'équipe : chacun sécurise et teste sa tranche | 🔴 | `docs/report/10-evaluation-securite.md` |
| 6 | Performance (benchmarks + analyse) | Infra | Dev Appels (dégradation réseau), Dev Messagerie (profilage) | 🔴 | `docs/reports/` |
| 7 | Operations (monitoring + runbooks) | Infra | Flex (runbooks, plan d'urgence, DORA) ; chaque dev : dashboard et alertes de sa tranche | 🔴 | `docs/report/12-monitoring-evaluation-operationnelle.md` |
| 8 | Data and AI | Dev Appels | Infra fournit les métriques | 🔴 | `docs/reports/` |
| 9 | Report (rapport technique final) | Dev Messagerie (assemblage) | chacun écrit son chapitre | 🔴 | `docs/report/` |
| 10 | Demonstration | Flex | toute l'équipe répète | 🔴 | — |

Livrables possédés : Flex 4 · Infra 2 · Dev Messagerie 2 · Dev Appels 1 (+ coturn et Data/IA dans sa tranche).
