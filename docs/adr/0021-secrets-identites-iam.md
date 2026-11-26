# ADR-0021 : Secrets — identités IAM plutôt que Secret Manager

- **Statut** : proposé
- **Date** : 2026-11-26
- **Auteur (domaine)** : THEO (projet)
- **Relecteur (autre domaine)** : à désigner (infra)
- **Exigences concernées** : NFR-04, NFR-07

## Contexte

Le dépôt est public : aucun secret ne doit y entrer. Aujourd'hui, les secrets de production sont prévus dans les GitHub Environments et dans un `.env` hors dépôt sur la VM (`chmod 600`, [ADR-0012](0012-deploiement-et-hebergement.md) § 6). Deux ADR proposés renvoient à **Secret Manager** sans que l'équipe l'ait retenu : l'[ADR-0017](0017-base-de-donnees-cloud-sql.md) (Cloud SQL) pour le mot de passe de la base, l'[ADR-0020](0020-connexion-microsoft-entra-id.md) (connexion Microsoft) pour `MICROSOFT_CLIENT_SECRET`. L'[ADR-0018](0018-terraform-et-load-balancer-gcp.md) laisse ouvert le mécanisme qui évite une clé de compte de service durable dans la CI, et [`infra/README.md`](../../infra/README.md) interdit de créer ou de commiter une clé JSON de compte de service.

Inventaire des secrets d'exécution lus par l'API ([`apps/api/src/config.ts`](../../apps/api/src/config.ts), [`.env.example`](../../.env.example)) :

| Variable | Rôle | Nature |
| --- | --- | --- |
| `DATABASE_URL` | connexion PostgreSQL, **avec mot de passe** | identifiant |
| `JWT_SECRET` | signature HS256 des access tokens et du cookie PKCE de la connexion Microsoft ([ADR-0007](0007-sessions-jwt-refresh-rotatif.md), ADR-0020) | clé symétrique |
| `TURN_SHARED_SECRET` | HMAC des identifiants TURN éphémères, partagé avec coturn ([ADR-0009](0009-webrtc-p2p-coturn.md)) | clé symétrique |
| `MICROSOFT_CLIENT_SECRET` | authentification de l'API auprès de Microsoft lors de l'échange du code (client confidentiel, ADR-0020) | identifiant d'application, expire |

`BACKUP_AGE_RECIPIENT` est une **clé publique** : ce n'est pas un secret.

Question posée : faut-il un service de plus (Secret Manager) pour ranger ces valeurs, ou peut-on en supprimer une partie en faisant s'authentifier chaque machine par son **identité Google (IAM)** plutôt que par un mot de passe stocké ?

## Options considérées

1. **`.env` sur la VM, alimenté à la main** (état actuel de l'ADR-0012) : rien à construire. Mais une étape manuelle non reproductible (contraire à NFR-07), le mot de passe de la base et une éventuelle clé de compte de service restent des secrets durables, et la CI a besoin d'une clé pour agir sur GCP.
2. **Secret Manager pour tous les secrets** : stockage chiffré, versions, journal d'accès. Mais c'est un service et une API de plus à configurer, à payer et à expliquer, la VM doit lire les secrets au démarrage (code ou script en plus), et cela ne supprime aucun secret : le mot de passe de la base et la clé de la CI existent toujours, ils sont seulement rangés ailleurs.
3. **Identités IAM partout où GCP le permet, secrets symétriques restants fournis par Terraform** : on supprime les identifiants qu'IAM sait remplacer (base, bucket, CI) et on assume les quelques clés symétriques qui restent. Pas de service de plus. En contrepartie, la sécurité repose sur des rôles IAM **étroits** ; un rôle trop large remplace un secret par un accès trop large.

## Décision

**Option 3, en cible.** Principe : une machine ou un service s'authentifie par son identité Google, pas par un mot de passe stocké quelque part.

1. **VM vers Cloud SQL** : la VM utilise son compte de service, avec le rôle « Client Cloud SQL » (`roles/cloudsql.client`) et l'authentification IAM de la base (rôle `roles/cloudsql.instanceUser` et utilisateur de base de type compte de service). Plus de mot de passe de base. **Ce n'est pas acquis** : cela dépend de la mise en place de Cloud SQL ([ADR-0017](0017-base-de-donnees-cloud-sql.md), statut « proposé ») et demande du code, car l'API se connecte aujourd'hui avec `DATABASE_URL` et un mot de passe. Il faudra soit le proxy d'authentification Cloud SQL en conteneur à côté de l'API (`--auto-iam-authn`, sans changer le code de connexion), soit le connecteur Cloud SQL pour Node.js dans l'API. Le choix se fera dans l'issue d'implémentation ; tant qu'il n'est pas fait, le mot de passe de la base suit le même chemin que les secrets du point 6.
2. **VM vers le bucket Cloud Storage des sauvegardes** (#42) : le même compte de service, avec un rôle limité à l'**écriture d'objets** dans ce seul bucket (`roles/storage.objectCreator`, accordé sur le bucket et non sur le projet ; à vérifier avec l'outil de copie retenu, qui peut exiger un droit de lecture). Pas de clé. La VM ne peut ni lire ni supprimer les sauvegardes existantes : un attaquant qui la prend ne peut pas effacer l'historique. La restauration se fait avec le compte d'un membre de l'équipe.
3. **CI GitHub vers GCP** : **Workload Identity Federation**. GitHub Actions prouve son identité à Google par un jeton OIDC temporaire, que Google échange contre un accès de courte durée à un compte de service de déploiement. La fédération n'accepte que les jetons de ce dépôt (condition d'attribut sur `repository`, et sur la branche ou l'environnement de production). Aucune clé de compte de service n'est stockée dans GitHub. Cela répond au point laissé ouvert par l'ADR-0018.
4. **Secrets des GitHub Environments** : ils ne servent que dans la CI (build, publication, déploiement) et n'arrivent jamais sur le réseau ni sur la VM. Avec la fédération, ils ne contiennent plus que des valeurs **non sensibles** (identifiant du projet, fournisseur d'identité, compte de service à utiliser) ; l'environnement `production` sert surtout à exiger une **approbation** avant déploiement.
5. **Connexion des utilisateurs avec Microsoft Entra ID** : **rien côté navigateur**, qui ne voit que le code d'autorisation protégé par PKCE. **Côté API, il reste un secret** : l'API est un client confidentiel et envoie `MICROSOFT_CLIENT_SECRET` à Microsoft lors de l'échange du code (ADR-0020). Il est fourni comme les autres secrets symétriques (point 6). Il **expire** : durée choisie à la création dans Entra (6 mois recommandés, 24 au plus) ; la date est à noter dans le runbook. Évolution possible : une identité fédérée GCP vers Entra (informations d'identification fédérées de l'App registration), qui supprimerait ce secret ; non conçue, non testée.
6. **Secrets d'exécution restants, assumés** : `JWT_SECRET`, `TURN_SHARED_SECRET` et `MICROSOFT_CLIENT_SECRET` sont des secrets qu'IAM ne peut pas remplacer (clés symétriques ou identifiant d'une application hors de GCP). Ils sont fournis à la VM comme **variables protégées à sa création, par Terraform** (variables Terraform marquées `sensitive`, valeurs saisies hors dépôt), jamais écrits dans le dépôt ni dans GitHub. Ce sont les seuls secrets d'exécution de la cible. Si l'on veut les sortir de la VM plus tard, c'est là que Secret Manager aurait sa place.

**Pourquoi** : on supprime trois identifiants durables (mot de passe de la base, clé de la CI, accès au bucket) au lieu de les déplacer, sans ajouter de service ; le reste est petit, connu et listé.

## Conséquences

- **Moindre privilège obligatoire** : un compte de service par usage (VM web, VM TURN, déploiement CI), chacun avec les seuls rôles listés ci-dessus, accordés sur la ressource la plus étroite (instance, bucket) plutôt que sur le projet. À vérifier par `gcloud projects get-iam-policy` et `gcloud storage buckets get-iam-policy` ; jamais de rôle « Éditeur » ou « Propriétaire » sur un compte de service. C'est le point à rappeler à toute l'équipe : l'IAM simplifie, mais une identité trop large est pire qu'un secret bien rangé.
- **La VM TURN** n'a besoin que de `TURN_SHARED_SECRET` ; elle ne reçoit ni `JWT_SECRET` ni `MICROSOFT_CLIENT_SECRET`, et son compte de service n'a ni rôle Cloud SQL ni rôle sur le bucket.
- **Limites assumées des secrets fournis par Terraform** :
  - ils figurent **en clair dans l'état Terraform** : l'état ne doit jamais être commité (`.gitignore` exclut `*.tfstate`) et son emplacement (ADR-0018, à régler) doit être aussi protégé que les secrets eux-mêmes ;
  - selon le mécanisme retenu (métadonnées de la VM ou fichier écrit au démarrage), ils sont lisibles par **tout processus de la VM** et par **tout compte IAM** qui peut lire l'instance : c'est la principale faiblesse par rapport à Secret Manager, qui journalise chaque accès ;
  - leur **rotation** demande de recréer ou de reconfigurer la VM ; pour `JWT_SECRET`, elle déconnecte tous les utilisateurs (sessions à rouvrir) ; pour `TURN_SHARED_SECRET`, l'API et coturn doivent changer ensemble.
- **Vue J1** (27 novembre) : rien de cela n'est en place. PostgreSQL tourne dans le Compose avec un mot de passe et les secrets restent dans le `.env` hors dépôt de l'ADR-0012 § 6. Cet ADR décrit la cible.
- **Documents à aligner** si l'ADR est accepté : ADR-0012 § 6 (chemin des secrets), ADR-0017 § Identifiants et ADR-0020 § Secret (mention de Secret Manager), ADR-0018 (authentification de la CI), runbook (date d'expiration du secret Microsoft).
- **À prouver** (rien n'est mesuré à ce jour) : connexion de l'API à Cloud SQL sans mot de passe ; refus d'une lecture ou d'une suppression dans le bucket depuis la VM ; job de déploiement vert sans clé dans GitHub, et refus d'un jeton venant d'un autre dépôt ; absence de `JWT_SECRET` sur la VM TURN.
- **À revoir** si l'équipe doit faire tourner les secrets souvent, en auditer les accès, ou si plusieurs VM web doivent partager `JWT_SECRET` : Secret Manager redevient alors pertinent pour les secrets du point 6.
