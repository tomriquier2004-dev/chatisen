# Rapport : SSH par IAP, ports fermés et essai de rollback (séance du 26 novembre 2026)

> Issues #112 et #12 · NFR-04, NFR-07 · Livrable 5 (Security) et 3 (déploiement reproductible) · ADR : [`0016`](../adr/0016-point-d-entree-caddy-et-ports-turn.md), [`0022`](../adr/0022-registre-ghcr-et-deploiement-manuel-j1.md) · Mode d'emploi : [`infra/README.md`](../../infra/README.md)

## Objectif

Fermer l'accès SSH ouvert à Internet en passant par IAP, prouver que les ports non web sont injoignables, et essayer un retour arrière (rollback) sur la VM.

## Méthode

- Étapes dans l'ordre du runbook. L'API IAP, la règle `chatisen-ssh-iap` (port 22 depuis `35.235.240.0/20`) et la fermeture du TCP 5349 avaient déjà été faites par un membre de l'équipe pendant la séance ; elles ne sont pas refaites.
- Rôle `roles/iap.tunnelResourceAccessor` donné au membre qui utilisait le SSH sans l'avoir ; les autres l'avaient ou sont propriétaires. Chaque membre a testé `gcloud compute ssh … --tunnel-through-iap` avant la suppression (déclaré par l'équipe) ; le test du compte qui a mené la séance est vérifié par la sortie `IAP-OK`.
- Relevés depuis le poste de Sha, hors de GCP. L'adresse IP n'est pas consignée (dépôt public).

## Résultats

| Vérification | Résultat | Source |
| --- | --- | --- |
| `default-allow-ssh` supprimée | ✅ la règle n'apparaît plus ; restent `chatisen-ssh-iap`, `chatisen-turn`, `chatisen-web`, `default-allow-icmp`, `default-allow-internal` | `gcloud compute firewall-rules list` |
| SSH par IAP après la suppression | ✅ `IAP-OK` | `gcloud compute ssh --tunnel-through-iap --command` |
| Port 22 de la VM fermé depuis Internet | ✅ injoignable (délai dépassé ou refus) | test de connexion TCP ci-dessous |
| Contrôle positif | ✅ `github.com:22` répond depuis le même poste : ce réseau laisse sortir le port 22, l'échec sur la VM est donc significatif | même test |
| Ports 3478, 5349, 3389, 5432, 6379, 3000, 9090, 2019 | ✅ injoignables ; 3478 l'est parce que coturn n'est pas déployé, pas à cause du pare-feu (la règle l'ouvre) | même test |
| Ports 80 et 443 | ✅ joignables | même test |
| Port 5349 non ouvert par le pare-feu | ✅ la règle `chatisen-turn` n'autorise plus que 3478 (TCP et UDP) et UDP 49152-49252 | `gcloud compute firewall-rules list` |

```text
github.com:22  OUVERT       (contrôle positif)
<VM>:22        fermé ou filtré
80, 443        OUVERT
3478, 5349, 3389, 5432, 6379, 3000, 9090, 2019 : fermé ou filtré
```

Le test ne distingue pas « refusé » de « filtré ».

## Essai de rollback

Le rollback consiste à remettre ensemble l'ancienne configuration (`git checkout <commit>`) et l'ancien `IMAGE_TAG`, puis `pull` et `up -d` (runbook, ADR-0022).

| Étape | Résultat |
| --- | --- |
| Retour de `a131866` (supervision) à `5abdda23dd9a` | ✅ API « healthy » en 19 s ; `/api/v1/health/ready` répond 200 depuis Internet |
| Retour à `a131866` avec l'override de supervision | ✅ API « healthy » ; cibles Prometheus `api` et `prometheus` UP |

**Limites** : les deux versions utilisaient les mêmes images (`sha-5abdda23dd9a`) : l'essai prouve le mécanisme et le retour de configuration, pas le retour d'une image à une autre. Avant `5abdda2`, le Compose ne transmettait pas le TURN et l'API ne démarre pas : on ne peut pas revenir plus loin avec ce Compose. L'API a redémarré brièvement pendant l'essai.

## Reste à faire

- Le bouton « SSH » de la console n'a pas été essayé après la fermeture.
- coturn (#117) : l'ouverture UDP 49152-49252 et le test d'un appel relayé ne sont pas prouvés.
- Resserrer `default-allow-internal` et les rôles `owner` et `editor` (voir l'[inventaire](inventaire-gcp-2026-11-26.md)).
