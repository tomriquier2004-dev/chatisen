# Rapport : déploiement du squelette J1 sur la VM (séance du 26 novembre 2026)

> Issues #12, #142, #158 · NFR-03, NFR-04, NFR-07 · Livrable 3 (Application et déploiement reproductible) · ADR : [`0022`](../adr/0022-registre-ghcr-et-deploiement-manuel-j1.md), [`0016`](../adr/0016-point-d-entree-caddy-et-ports-turn.md) · Mode d'emploi : [`infra/README.md`](../../infra/README.md)

## Objectif

Déployer à la main les images publiées par la CI sur la VM `chatisen-prod` (Compose de production), vérifier le HTTPS, l'état des services, la sauvegarde chiffrée et la fermeture des ports, et consigner ce qui reste à faire.

## Méthode

- Commit déployé : `5abdda23dd9a` (images `sha-5abdda23dd9a`, publiées par le workflow `Images` sur `main`). La séance a commencé sur `b1c3a4f5ba4f`, puis a été mise à jour après le merge de la correction TURN (#159).
- Les commandes sont celles du runbook. Les relevés réseau ont été faits depuis le poste de Sha, hors de GCP. L'adresse IP n'est pas consignée (dépôt public).
- Aucun secret n'est reproduit ici : seules des longueurs ou des états sont relevés.

## Résultats

| Vérification | Résultat | Source |
| --- | --- | --- |
| Images téléchargées sans authentification | ✅ manifeste `main` des trois images : HTTP 200 | requête anonyme sur le registre |
| Services de la pile | ✅ api, caddy, postgres, redis, postgres-backup « healthy » ; seul Caddy publie des ports (80 et 443) | `docker compose ps` |
| Santé de l'API depuis Internet | ✅ `{"status":"ready","checks":{"postgres":"up","redis":"up"}}`, HTTP 200 | `curl` |
| Certificat | ✅ émetteur Let's Encrypt (`CN=YE2`), valide du 2026-11-26 au 2027-02-24, TLS 1.3 | `openssl s_client` |
| Port 80 | ✅ redirection `308` vers `https://dc-ops.isen.fedyna.fr/` | `curl` |
| Inscription, conversation, messages | ✅ déclaré par l'équipe (Sha et Tom) sur le nom de domaine, en HTTPS | test manuel, non enregistré |
| Sauvegarde chiffrée | ✅ fichier `.dump.age` et son `.sha256` produits dans le conteneur `postgres-backup` ; ⚠️ **déchiffrement non testé** (la clé privée reste sur le poste de Sha) | `ls` dans le conteneur |
| Ports 3389, 5432, 6379, 3000, 9090, 5349, 2019 | ✅ non joignables depuis Internet | test de connexion TCP ci-dessous |
| Contrôle positif | ✅ le port 22 répond depuis ce réseau : un port non web ouvert est donc bien visible | même test |

```text
22 OUVERT      (contrôle positif : règle default-allow-ssh)
80 OUVERT
443 OUVERT
3389, 5432, 6379, 3000, 9090, 5349, 2019 : fermé ou filtré
```

Le test ne distingue pas « refusé » de « filtré ».

## Écarts et limites

- **Bug trouvé et corrigé** : l'API refuse de démarrer sur un hôte exposé sans `TURN_SHARED_SECRET` (32 caractères minimum) ni `TURN_URLS`, et `compose.prod.yml` ne les transmettait pas. Contournement provisoire sur la VM (fichier non suivi), puis correction durable dans #159 ; le fichier de contournement a été retiré.
- **Appels sans média** : l'appel sonne et est reçu, mais l'audio et la vidéo de l'autre ne passent pas. coturn n'est pas déployé (aucun processus n'écoute sur le port 3478) : cause probable, **non prouvée**. À confirmer avec les journaux de coturn et `chrome://webrtc-internals` après le déploiement de coturn (#117).
- **Secret TURN provisoire** : à remplacer par celui de coturn.
- **Pare-feu** : la règle `chatisen-turn` ouvre encore TCP 5349, que l'ADR-0016 ferme ; `default-allow-ssh` est encore ouverte à Internet. Les deux sont traitées dans #112.
- **Rollback** : la procédure est documentée (même commit pour la configuration et pour les images), mais **pas essayée**.
- **Hors périmètre de cette séance** : déploiement automatique (F09), IAP, load balancer, Cloud SQL.
