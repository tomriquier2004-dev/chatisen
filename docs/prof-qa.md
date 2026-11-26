# Questions / réponses avec l'encadrant

Une seule voix côté équipe (Project Owner). Toute question et toute réponse est consignée ici, avec la date.

## À poser en priorité

| # | Question | Date posée | Réponse | Date réponse |
| --- | --- | --- | --- | --- |
| 1 | Dates des jalons et de la soutenance ?|| 11 décembre = soutenance| | |
| 2 | Grille de notation et pondération des 10 livrables ? ||non définie | | 
| 3 | Équipe de 4 validée ? Note individuelle ou collective ? | |notes individuelles ET collective| | |
| 4 | Hébergement : crédits cloud, VM ISEN, ou auto-hébergement ? | non consignée | « hebergement avec csp free tier sur Oracle Cloud (en attente d'inscription) » | non consignée | 
| 5 | Combien d'extensions attendues (le briefing dit « not all expected ») ? | | core uniquement et on verra par la suite  | |
| 6 | Les 6 axes « investigative work » sont-ils tous obligatoires ou au choix ? | | obligatoire tout au long du developpement| | 
| 7 | Langue, format et longueur du rapport ? | | français| | 
| 8 | Durée de la démo finale ; le réseau de la salle laisse-t-il passer UDP/TURN ? | | pas défini| | 

## Consignes de l'encadrant

Consignes données sans question préalable, rapportées par le Project Owner. La colonne « Suite » renvoie au document qui en tient compte.

| # | Consigne | Date | Rapportée par | Suite |
| --- | --- | --- | --- | --- |
| C1 | La base de données ne doit pas être sur la VM GCP. | 2026-11-25 | Theo | Base sur Cloud SQL pour PostgreSQL, IP privée dans le VPC ([ADR-0017](adr/0017-base-de-donnees-cloud-sql.md), confirmé par Theo le 2026-11-25 ; la piste Supabase est abandonnée). |
| C2 | Séparer le flux vers coturn du flux vers Caddy : coturn consomme beaucoup et peut geler Caddy. | 2026-11-25 | Theo | VM TURN séparée dans la vue cible ([`architecture.md`](architecture.md) § 8.3) ; l'[ADR-0016](adr/0016-point-d-entree-caddy-et-ports-turn.md) reste à amender. |
| C3 | Une VM d'entrée avec sa propre IP externe statique ne sert à rien : l'IP est portée par le load balancer. | 2026-11-25 | Theo | IP statique portée par la règle de transfert du load balancer réseau passthrough, Caddy gardé pour le TLS ([ADR-0018](adr/0018-terraform-et-load-balancer-gcp.md), `architecture.md` § 8.3). |
| C4 | L'authentification passe par Microsoft (compte ISEN). | 2026-11-26 | Sha | Connexion Microsoft Entra ID, OIDC avec PKCE ([ADR-0020](adr/0020-connexion-microsoft-entra-id.md)). |
| C5 | Le stockage doit se faire dans GCP, pas à l'extérieur (sur le schéma). | 2026-11-26 | Sha | Cloud SQL et bucket Cloud Storage dans le projet GCP ([ADR-0017](adr/0017-base-de-donnees-cloud-sql.md), `architecture.md` § 8.3). |
| C6 | Détailler le lien avec les secrets des GitHub Environments : ils ne servent que dans la CI, jamais sur le réseau d'exécution. | 2026-11-26 | Sha | Identités IAM à l'exécution, Workload Identity Federation pour la CI ([ADR-0021](adr/0021-secrets-identites-iam.md), proposé). |
| C7 | Fonctionner en monolithe modulaire (modules et interfaces), puis architecture hexagonale (un cours suivra) ; définir les interfaces (OpenAPI, tests d'API REST, REST standardisé). La scalabilité est une fonctionnalité avancée, donc non prioritaire. | 2026-11-26 | Sha | [ADR-0023](adr/0023-monolithe-modulaire-et-architecture-hexagonale.md) (proposé) ; découpage, interfaces et diagrammes dans [`architecture.md` § 13](architecture.md#13-découpage-en-modules-monolithe-modulaire). Aucun impact sur le déploiement : un seul service. |

L'IP statique n'est jamais écrite dans ce dépôt, qui est public.
