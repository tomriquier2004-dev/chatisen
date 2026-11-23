# Suivi des livrables

Un seul tableau, relu à chaque point hebdomadaire. **Pas de preuve = pas fini.**

Statut : 🔴 non démarré · 🟠 en cours · 🟢 terminé et prouvé

| # | Livrable | Propriétaire | Contributeurs | Statut | Preuve (chemin) |
| --- | --- | --- | --- | --- | --- |
| 1 | Specification | A | toute l'équipe (phase 0) | 🔴 | `docs/requirements/`, `docs/report/` |
| 2 | Justification (ADR) | A (registre) | chacun, pour son domaine | 🔴 | `docs/adr/` |
| 3 | Application + déploiement reproductible | A (back) · B (front) · C (déploiement) | — | 🔴 | `apps/`, `infra/` |
| 4 | Tests (automatisés + rapports) | D | chacun teste son code | 🔴 | `docs/reports/` |
| 5 | Security (analyse + validation) | D | A et B corrigent | 🔴 | `docs/report/10-evaluation-securite.md` |
| 6 | Performance (benchmarks + analyse) | D | C fournit les métriques | 🔴 | `docs/reports/` |
| 7 | Operations (monitoring + runbooks) | C | — | 🔴 | `docs/report/12-monitoring-evaluation-operationnelle.md` |
| 8 | Data and AI | D | B fournit les stats WebRTC | 🔴 | `docs/reports/` |
| 9 | Report (rapport technique final) | B (assemblage) | chacun écrit son chapitre | 🔴 | `docs/report/` |
| 10 | Demonstration | B | toute l'équipe répète | 🔴 | — |

> Les rôles A/B/C/D sont des étiquettes provisoires : voir [`team.md`](team.md) pour l'affectation des personnes.
