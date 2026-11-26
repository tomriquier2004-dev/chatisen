# ADR-0020 : Connexion avec un compte Microsoft (Entra ID, OpenID Connect)

- **Statut** : proposé
- **Date** : 2026-11-25
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : à désigner (Tom, responsable du livrable sécurité, de préférence)
- **Exigences concernées** : FR-01, FR-02, FR-04, NFR-04

> Numéro 0020 : 0015 est réservé à Tom, 0017 (base de données sur Cloud SQL), 0018 (Terraform) et 0019 sont pris ou réservés.

## Contexte

Tous les étudiants ont un compte Microsoft (adresse scolaire Microsoft 365 ou compte personnel Outlook). Leur demander un mot de passe de plus est une friction et un risque (réutilisation de mot de passe). On veut une **connexion Microsoft générique** : n'importe quel compte Microsoft, personnel ou scolaire, **sans dépendre d'un accord de l'école** ni d'une configuration chez elle. L'application est enregistrée par l'équipe dans son propre tenant Entra ID.

Contraintes : la session ChatISEN existante (ADR-0007 : JWT court + refresh token rotatif) doit rester **le seul mécanisme de session**, pour ne rien changer au REST, à Socket.IO ni à la révocation ; plusieurs instances d'API ; aucun secret dans le dépôt public ; le mot de passe reste disponible en repli (Microsoft indisponible, compte de démonstration, tests).

## Options considérées

1. **Statu quo (mot de passe seul)** : rien à faire, mais pas de connexion avec le compte que tout le monde a déjà.
2. **Flux côté navigateur (SPA, MSAL.js, PKCE sans secret)** : l'application devient un « client public », le jeton ID arrive dans le navigateur puis doit être renvoyé à l'API pour ouvrir une session. Ajoute une dépendance lourde côté client et une deuxième frontière de confiance à valider.
3. **Flux Authorization Code + PKCE côté API (client confidentiel)**, avec `jose` déjà présent : le navigateur ne voit ni le code échangé ni les jetons Microsoft ; l'API valide le jeton ID puis ouvre une session ChatISEN ordinaire.
4. **Fédération par un service tiers (Auth0, Firebase Auth, Supabase Auth)** : un service et un compte de plus, des données d'identité hors de GCP, alors qu'un seul fournisseur est visé.

## Décision

**Option 3.** Point d'entrée `GET /api/v1/auth/microsoft/start`, retour `GET /api/v1/auth/microsoft/callback`, autorité `common` par défaut (comptes personnels et professionnels/scolaires).

- **PKCE S256 + `state` + `nonce`**, gardés dans un **cookie signé** (HS256 avec `JWT_SECRET`, audience distincte de celle des access tokens, 10 minutes, `httpOnly`, `SameSite=Lax`, `Path=/api/v1/auth/microsoft`). Signé plutôt que stocké : n'importe quelle instance traite le retour, sans Redis. `Lax` est nécessaire car le retour de Microsoft est une navigation intersite. Le `state` est comparé à temps constant ; sans cookie valide, le retour est refusé (CSRF de connexion).
- **Client confidentiel** : le secret ne quitte jamais l'API ; l'échange du code envoie le secret **et** le vérificateur PKCE.
- **Validation du jeton ID** (OIDC Core § 3.1.3.7) : signature RS256 avec le JWKS public de Microsoft (mis en cache par `jose`), audience = identifiant de l'application, expiration (tolérance 60 s), `nonce`, et émetteur égal à `https://login.microsoftonline.com/{tid}/v2.0` où `tid` est le tenant du jeton (règle multi-tenant documentée par Microsoft). Liste de tenants autorisés facultative (`MICROSOFT_ALLOWED_TENANTS`).
- **Identifiant stable** : `tid:oid` (tenant + objet utilisateur), dans une table `user_identities`, **jamais l'adresse e-mail**, que Microsoft déclare modifiable et non garantie.
- **Liaison à un compte existant par l'adresse e-mail, seulement si elle est vérifiée** : la revendication `xms_edov` (« email domain owner verified ») doit valoir `true`. Sinon, si un compte local a déjà cette adresse, la connexion est **refusée** (`MICROSOFT_ACCOUNT_EXISTS`) et l'utilisateur se connecte par mot de passe. Lier sur une adresse non vérifiée permettrait à l'administrateur de n'importe quel tenant de créer un utilisateur portant l'adresse d'une victime et de prendre son compte (attaque dite « nOAuth »).
- **Nouveau compte** : créé sans mot de passe (`password_hash` devient facultatif, migration 0003), nom d'utilisateur tiré de la partie locale de l'adresse (suffixe aléatoire si pris), nom affiché = `name`.
- **Session** : identique à la connexion par mot de passe (ADR-0007). Le callback pose le cookie de refresh et redirige vers `/` ; le client restaure la session par `/auth/refresh` comme à chaque chargement. Les échecs reviennent en `/?authError=<code>` (codes fermés, dans `@chatisen/shared`).
- **Désactivable** : sans `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` et `MICROSOFT_REDIRECT_URI`, les routes n'existent pas et `GET /auth/providers` répond `microsoft: false` ; le client masque le bouton. Une configuration partielle empêche le démarrage.

## Conséquences

- Aucune nouvelle dépendance (`jose` et `@fastify/cookie` étaient déjà là) ; aucun changement pour Socket.IO, la révocation ou le refresh.
- **Secret** : `MICROSOFT_CLIENT_SECRET` vit dans Secret Manager en déploiement et dans `.env` en local. Les secrets d'App registration **expirent** (24 mois au plus) : la date est à noter dans le runbook. Un certificat ou une identité fédérée (sans secret) serait plus robuste, hors périmètre.
- **Limite assumée** : un compte créé par Microsoft n'a **pas de mot de passe** ; si Microsoft est indisponible, son titulaire ne peut pas se connecter. Les comptes à mot de passe ne sont pas affectés.
- **Limite assumée** : un étudiant qui a déjà un compte ChatISEN à mot de passe et dont l'adresse n'est pas marquée vérifiée (`xms_edov` absent ou faux, cas probable des comptes personnels) **ne peut pas lier** son compte Microsoft pour l'instant. Une liaison explicite depuis une session ouverte (preuve de possession des deux comptes) est la suite logique.
- **Non vérifié** : la présence réelle de `xms_edov` dans les jetons des comptes ISEN et des comptes personnels. Microsoft la documente comme revendication facultative à demander dans « Token configuration » ; elle n'a pas été observée sur un vrai jeton. Si elle manque, la liaison automatique ne se fait jamais (le comportement reste sûr).
- **Consentement dans le tenant de l'école (risque principal)** : l'application ne demande que `openid profile email`, mais elle vient d'un éditeur **non vérifié** (la vérification d'éditeur exige un compte Microsoft Partner, hors de portée d'une équipe étudiante). Beaucoup de tenants, dont le réglage par défaut récent de Microsoft, n'autorisent le consentement par l'utilisateur que pour les éditeurs vérifiés. Si c'est le cas à l'ISEN, les **comptes scolaires** verront « Approbation de l'administrateur requise » ; les **comptes personnels** (Outlook, Hotmail) et le **mot de passe** restent utilisables. Non vérifié à ce jour : à tester avec un compte ISEN dès que l'App registration existe.
- **Microsoft impose l'HTTPS** pour l'URI de redirection, sauf `http://localhost` : en développement, ouvrir l'application par `http://localhost:5173` (le cookie de flux est lié à l'hôte).
- Le retour de Microsoft est une **dépendance externe** sur le chemin de connexion : à couvrir par une alerte (taux d'échec `microsoft login rejected` dans les logs) quand l'observabilité (ADR-0013) sera en place.
- Tests : validation du jeton avec des clés générées localement (signature, audience, émetteur, nonce, expiration, tenants) et parcours complet avec un faux fournisseur (création, reconnexion, liaison vérifiée, refus non vérifié, CSRF, annulation). Aucun test contre le vrai Microsoft dans la CI.
