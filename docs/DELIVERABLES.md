# Suivi des livrables

Un seul tableau, relu à chaque point. **Pas de preuve = pas fini.** Échéances alignées sur [`planning.md`](planning.md) (soutenance le 11 décembre).

Statut : 🔴 non démarré · 🟠 en cours · 🟢 terminé et prouvé

| # | Livrable | Propriétaire | Contributeurs | Échéance | Statut | Preuve (chemin) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Specification | Flex (assemblage) | toute l'équipe ; architecture dans `docs/architecture.md` | 27 nov | 🟠 | `docs/requirements/`, `docs/architecture.md` |
| 2 | Justification (ADR) | Flex (registre) | chacun écrit les ADR de son domaine, un autre relit | 27 nov (socle) | 🟠 | `docs/adr/` (19 fichiers dont le modèle : 3 acceptés, les autres proposés, relecture croisée à finir) |
| 3 | Application + déploiement reproductible | Infra (plateforme, déploiement) | Dev Messagerie (messagerie), Dev Appels (appels, coturn) | 4 déc (Core) | 🟠 | `apps/`, `infra/` ; images construites et scannées par `.github/workflows/images.yml` ; **pas encore déployé sur la VM** (runbook : `infra/README.md`) |
| 4 | Tests (automatisés + rapports) | Dev Messagerie (stratégie, e2e, rapport) | chacun teste sa tranche | 7 déc | 🟠 | `docs/reports/e2e-messagerie.md`, tests dans `apps/` et `packages/`, `apps/web/e2e/`, `.github/workflows/ci.yml` et `e2e.yml` ; chapitre 8 du rapport à écrire |
| 5 | Security (analyse + validation) | Flex | toute l'équipe : chacun sécurise et teste sa tranche | 7 déc | 🟠 | `docs/report/10-evaluation-securite.md`, `docs/reports/ports-tls-2026-11-25.md`, Semgrep et Trivy en CI ; atelier STRIDE (#27) et ADR-0015 à faire |
| 6 | Performance (benchmarks + analyse) | Infra | Dev Messagerie (charge), Flex (optimisation) | 7 déc | 🔴 | `docs/reports/` |
| 7 | Operations (monitoring + runbooks) | Infra | Flex (runbooks, plan d'urgence) ; chaque dev : dashboard et alertes de sa tranche | 4 déc (monitoring), 7 déc (runbooks) | 🟠 | `docs/report/12-monitoring-evaluation-operationnelle.md`, `infra/observability/`, `infra/backup/`, `docs/reports/backup-restore-test.md` ; exercice de restauration humain (#46) et sauvegarde hors hôte (#42) à faire |
| 8 | Data and AI | Dev Appels (qualité, PoC IA) | Dev Messagerie (analyse d'usage), Infra (métriques, `netem`) | 7 déc | 🟠 | `docs/reports/call-quality-netem.md`, `scripts/analyze_call_quality.py` ; analyse d'usage (#28) non démarrée |
| 9 | Report (rapport technique final) | Dev Messagerie (assemblage) | chacun écrit son chapitre | 8 déc | 🔴 | `docs/report/` |
| 10 | Demonstration | Flex | toute l'équipe répète | 9-10 déc | 🔴 | — |

Livrables possédés : Flex 4 · Infra 2 · Dev Messagerie 2 · Dev Appels 1 (+ coturn). Les 6 axes d'investigation sont répartis entre les 4 membres dans [`planning.md`](planning.md).
