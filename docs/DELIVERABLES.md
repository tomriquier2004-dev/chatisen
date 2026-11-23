# Suivi des livrables

Un seul tableau, relu à chaque point. **Pas de preuve = pas fini.** Échéances alignées sur [`planning.md`](planning.md) (soutenance le 11 décembre).

Statut : 🔴 non démarré · 🟠 en cours · 🟢 terminé et prouvé

| # | Livrable | Propriétaire | Contributeurs | Échéance | Statut | Preuve (chemin) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Specification | Flex (assemblage) | toute l'équipe ; architecture dans `docs/architecture.md` | 27 nov | 🟠 | `docs/requirements/`, `docs/architecture.md` |
| 2 | Justification (ADR) | Flex (registre) | chacun écrit les ADR de son domaine, un autre relit | 27 nov (socle) | 🔴 | `docs/adr/` |
| 3 | Application + déploiement reproductible | Infra (plateforme, déploiement) | Dev Messagerie (messagerie), Dev Appels (appels, coturn) | 4 déc (Core) | 🔴 | `apps/`, `infra/` |
| 4 | Tests (automatisés + rapports) | Dev Messagerie (stratégie, e2e, rapport) | chacun teste sa tranche | 7 déc | 🔴 | `docs/reports/` |
| 5 | Security (analyse + validation) | Flex | toute l'équipe : chacun sécurise et teste sa tranche | 7 déc | 🔴 | `docs/report/10-evaluation-securite.md` |
| 6 | Performance (benchmarks + analyse) | Infra | Dev Messagerie (charge), Flex (optimisation) | 7 déc | 🔴 | `docs/reports/` |
| 7 | Operations (monitoring + runbooks) | Infra | Flex (runbooks, plan d'urgence) ; chaque dev : dashboard et alertes de sa tranche | 4 déc (monitoring), 7 déc (runbooks) | 🔴 | `docs/report/12-monitoring-evaluation-operationnelle.md` |
| 8 | Data and AI | Dev Appels (qualité, PoC IA) | Dev Messagerie (analyse d'usage), Infra (métriques, `netem`) | 7 déc | 🔴 | `docs/reports/` |
| 9 | Report (rapport technique final) | Dev Messagerie (assemblage) | chacun écrit son chapitre | 8 déc | 🔴 | `docs/report/` |
| 10 | Demonstration | Flex | toute l'équipe répète | 9-10 déc | 🔴 | — |

Livrables possédés : Flex 4 · Infra 2 · Dev Messagerie 2 · Dev Appels 1 (+ coturn). Les 6 axes d'investigation sont répartis entre les 4 membres dans [`planning.md`](planning.md).
