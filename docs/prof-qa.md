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

L'IP statique n'est jamais écrite dans ce dépôt, qui est public.
