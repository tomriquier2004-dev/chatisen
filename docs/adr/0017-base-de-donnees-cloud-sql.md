# ADR-0017 : Base de données sur Cloud SQL pour PostgreSQL

- **Statut** : proposé
- **Date** : 2026-11-25
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : Sha (infra), à confirmer
- **Exigences concernées** : NFR-02, NFR-03, NFR-04, NFR-07 ; FR-07, FR-08
- **Amende** : [ADR-0006](0006-donnees-postgresql-redis-kysely.md) (emplacement de PostgreSQL en déploiement), [ADR-0012](0012-deploiement-et-hebergement.md) (PostgreSQL sur l'hôte unique)

> Numéro 0017 : réservé à cet ADR par l'[ADR-0018](0018-terraform-et-load-balancer-gcp.md). Un premier brouillon retenait Supabase ; il n'a jamais été versionné et cet ADR le remplace.

## Contexte

- **Consigne du prof** (25 novembre 2026, consignée dans [`prof-qa.md`](../prof-qa.md)) : la base de données ne doit pas être sur la VM GCP.
- L'ADR-0006 retient PostgreSQL 16 et Kysely, avec les migrations au démarrage de l'API. Le déploiement décrit par l'ADR-0012 et `architecture.md` § 8.1 met PostgreSQL dans le Compose de la VM.
- Les sauvegardes chiffrées (`infra/backup/`, `pg_dump` + age toutes les 6 h, #9, #31) et le test de restauration existent ; la copie hors de l'hôte (#42) n'existe pas. Aujourd'hui, perdre la VM, c'est perdre les données depuis la dernière copie, qui est sur la même VM.
- La cible ([`architecture.md`](../architecture.md) § 8.3) place déjà tout le reste dans le projet GCP `chatisen`, région `europe-west1`. L'équipe dispose d'un crédit d'environ 269 €.

## Options considérées

1. **PostgreSQL dans le Compose de la VM** (situation actuelle) : rien à changer, latence minimale, gratuit. **Ne respecte pas la consigne du prof**, et la VM reste un point unique de défaillance pour les données.
2. **Supabase (PostgreSQL géré, offre gratuite)** : PostgreSQL standard, donc Kysely et les migrations ne changent pas ; sans frais. Mais la base est hors de GCP et joignable depuis Internet, chaque requête fait un aller-retour Internet, c'est un fournisseur et un secret de plus, les limites de l'offre gratuite (mise en pause d'un projet inactif, connexions, taille) n'ont pas été vérifiées, et le mode de connexion doit être en session pour les verrous des migrations.
3. **Cloud SQL pour PostgreSQL** : PostgreSQL 16 géré par Google dans la même région que les VM, joignable par une **IP privée du VPC** sans exposition à Internet, sauvegardes automatiques, payé sur le crédit GCP, décrit en Terraform comme le reste (ADR-0018). Inconvénients : **payant**, accès privé aux services (appairage VPC) à configurer, un service de plus à arrêter hors des heures d'usage.
4. **Une seconde VM GCP dédiée à PostgreSQL** : respecte la lettre de la consigne, mais il faudrait administrer soi-même sauvegardes, mises à jour et durcissement d'une VM de plus, pour un coût voisin de l'option 3.

## Décision

**Option 3, Cloud SQL pour PostgreSQL**, confirmée par Theo le 25 novembre 2026, à la place de Supabase et de PostgreSQL dans le Compose **pour l'environnement déployé**.

- **Instance** : PostgreSQL 16 (version de l'ADR-0006), édition Enterprise, région `europe-west1`, zonale (sans haute disponibilité). Type visé : `db-f1-micro` (cœur partagé), `db-g1-small` si les mesures le demandent. Disque SSD de 10 Gio.
- **Réseau** : **IP privée seulement**, par l'accès privé aux services dans le VPC du projet ; pas d'IP publique sur l'instance. L'API et le service de sauvegarde s'y connectent depuis la VM web.
- **Chiffrement en transit** : connexions TLS exigées par l'instance ; `DATABASE_URL` en `sslmode=require` au minimum, `verify-ca` avec le certificat de l'instance si le pilote le permet (à vérifier).
- **Identifiants** : un utilisateur PostgreSQL dédié à l'API, sans droits d'administration sur l'instance ; son mot de passe ne va **jamais dans le dépôt** (il est public). Il suit le chemin des autres secrets d'exécution (ADR-0012 § 6 aujourd'hui ; Secret Manager si l'équipe le retient).
- **Sauvegardes, deux niveaux** :
  1. sauvegardes automatiques de Cloud SQL, quotidiennes, rétention par défaut (7, à vérifier) ;
  2. **copie dans un bucket Cloud Storage** du projet, qui traite #42. Recommandation : garder le service `postgres-backup` existant (`pg_dump` + age, déjà testé par `restore-test.sh`), pointé vers l'IP privée, et ajouter l'envoi du fichier chiffré dans le bucket. L'export natif (`gcloud sql export sql` vers `gs://…`) est l'alternative ; il n'est pas chiffré par age et demande un déclencheur (cron ou Cloud Scheduler). À trancher à l'implémentation.
- **Inchangé** : Redis reste sur la VM (rien de durable, ADR-0006) ; le développement local et la CI gardent un PostgreSQL jetable (Compose, services de la CI) : Cloud SQL ne sert qu'en déploiement. Le code ne change pas, seule `DATABASE_URL` change.
- **J1 (27 novembre)** : si l'instance n'est pas créée et validée d'ici là, J1 garde le PostgreSQL du Compose et la bascule se fait ensuite par `pg_dump` / `pg_restore`, hors d'une répétition de démo.

## Conséquences

### Coût estimé (à vérifier)

Tarifs en USD lus le 25 novembre 2026 sur la page [Cloud SQL pricing](https://cloud.google.com/sql/pricing). **La page lue n'indique pas la région des prix affichés** : ce ne sont probablement pas ceux de `europe-west1`. Chiffres à refaire dans le calculateur Google pour la Belgique, puis à relever dans le rapport de facturation. Durée prise : 16 jours (384 h) jusqu'au 11 décembre, instance allumée en continu.

| Poste | Tarif lu (région non confirmée) | Sur 16 jours |
| --- | --- | --- |
| `db-f1-micro`, sans haute disponibilité | 0,0105 $/h | environ 4,0 $ |
| `db-g1-small`, si nécessaire | 0,035 $/h | environ 13,4 $ |
| Disque SSD, 10 Gio | 0,000232877 $ par Gio et par heure | environ 0,9 $ |
| Sauvegardes, moins de 1 Gio | 0,000109589 $ par Gio et par heure | moins de 0,1 $ |
| Bucket Cloud Storage (quelques fichiers chiffrés) | non relevé | négligeable (à vérifier) |

- **Ordre de grandeur** : environ 5 $ avec `db-f1-micro`, environ 15 $ avec `db-g1-small`, faible devant le crédit. Avec le load balancer (ADR-0018, environ 10 $), la cible resterait sous 30 $ jusqu'au 11 décembre : **à confirmer par le rapport de facturation**.
- **L'arrêt nocturne de la VM n'arrête pas Cloud SQL** : l'instance doit être arrêtée à part (politique d'activation), sinon elle est facturée la nuit. Instance arrêtée, le disque et les sauvegardes restent facturés (connaissance générale de GCP, **à vérifier**). Pendant l'arrêt, `/health/ready` de l'API échoue, comme aujourd'hui quand PostgreSQL ne répond pas.
- La page facture une IPv4 inutilisée (0,01 $/h) ; avec l'IP privée seule, cela ne devrait pas s'appliquer (**à vérifier**).

### Limites assumées

- **Pas de SLA** : la page de tarifs indique que les types à cœur partagé (`db-f1-micro`, `db-g1-small`) ne sont pas couverts par le SLA de Cloud SQL. Sans haute disponibilité, une panne de la zone ou une maintenance rend la messagerie indisponible (NFR-03) : assumé pour un projet académique, à noter dans le rapport.
- **Connexions** : le nombre maximal de connexions d'un `db-f1-micro` est faible (25 par défaut d'après la connaissance générale de Cloud SQL, **à vérifier**). La taille du pool Kysely multipliée par le nombre d'instances d'API, plus le service de sauvegarde, doit rester en dessous (NFR-02).
- **Latence** : un saut réseau de plus que le Compose (VM → instance, même région). À **mesurer** : p95 de l'accusé de réception de `message:send` (axe #24), comparé au PostgreSQL du Compose.
- **Verrouillage fournisseur** faible : PostgreSQL standard, la sortie se fait par `pg_dump`.
- **Point unique de défaillance déplacé, pas supprimé** : la perte de la VM ne perd plus de données ; la perte de l'instance reste couverte par les sauvegardes automatiques et la copie dans le bucket.

### Sécurité

- La base n'a pas d'IP publique : elle n'est joignable que depuis le VPC, ce qui conserve la règle « PostgreSQL n'est jamais exposé publiquement » de `architecture.md` § 8.1.
- Moindre privilège : l'utilisateur de l'API n'a de droits que sur sa base ; l'administration de l'instance passe par IAM (comptes des membres de l'équipe), pas par la VM.
- Les sauvegardes du bucket sont chiffrées par age avant l'envoi si l'option `postgres-backup` est retenue ; l'accès au bucket est limité au compte de service de la VM (écriture) et aux administrateurs.

### Documentation à aligner

`architecture.md` § 8 (fait dans cette PR) ; ADR-0006 et ADR-0012 (renvoi vers cet ADR, par leurs auteurs) ; ADR-0018 (sa mention de Supabase) ; `infra/backup/compose.yml` (le service `postgres` local devient inutile en déploiement) ; ressource Cloud SQL dans `infra/terraform/` (ADR-0018) ; chapitre 12 du rapport (coût).

## À vérifier avant de passer à « accepté »

- [ ] Relecture par un autre domaine (Sha, infra).
- [ ] Tarifs `europe-west1` relevés dans le calculateur et coût réel relevé dans le rapport de facturation.
- [ ] Instance créée avec IP privée seule ; port 5432 injoignable depuis Internet (preuve dans `docs/reports/`).
- [ ] TLS exigé : `select ssl from pg_stat_ssl where pid = pg_backend_pid();` renvoie `true` depuis l'API.
- [ ] Migrations au démarrage de l'API réussies sur l'instance.
- [ ] Limite de connexions relevée et taille du pool réglée en conséquence.
- [ ] Latence mesurée et comparée au PostgreSQL du Compose.
- [ ] Restauration testée depuis une sauvegarde automatique et depuis la copie du bucket (#42).
- [ ] Arrêt et redémarrage de l'instance hors des heures d'usage testés, comportement de `/health/ready` vérifié.
