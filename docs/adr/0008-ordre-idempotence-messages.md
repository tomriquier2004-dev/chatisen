# ADR-0008 : Ordre et idempotence des messages (`seq` + `client_msg_id`)

- **Statut** : proposé
- **Date** : 2026-11-23
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : à désigner (appels ou infra)
- **Exigences concernées** : FR-05, FR-07, FR-08, FR-17, FR-18

## Contexte

Les messages doivent s'afficher dans le même ordre pour tous les membres, même s'ils sont envoyés depuis plusieurs instances d'API et des appareils aux horloges différentes. Après une coupure réseau, le client doit pouvoir renvoyer un message sans créer de doublon (FR-17, FR-18), et rattraper ceux qu'il a manqués, dans l'ordre.

## Options considérées

**Ordre**
1. **Horodatage du client** : faux dès que deux horloges divergent, et manipulable.
2. **Horodatage du serveur (`created_at`)** : deux messages peuvent avoir le même instant, et les horloges de plusieurs instances peuvent dériver.
3. **Identifiant ordonné global** (séquence PostgreSQL, ULID) : ordre total, mais il ne dit pas s'il manque un message dans une conversation donnée.
4. **Compteur par conversation (`seq`)** attribué par le serveur dans la transaction d'insertion : ordre total par conversation, et les trous sont détectables, ce qui permet un rattrapage simple (« tout ce qui suit `seq = n` »).

**Doublons**
1. **Aucune protection** : un renvoi après timeout crée un doublon.
2. **Identifiant généré par le client (`client_msg_id`, UUID) avec contrainte d'unicité** : le serveur reconnaît un renvoi et renvoie le message déjà stocké.

## Décision

- **`seq` par conversation** : `UPDATE conversations SET last_seq = last_seq + 1 … RETURNING last_seq` puis `INSERT` du message, **dans la même transaction**. Contrainte `UNIQUE (conversation_id, seq)`. L'ordre affiché est toujours celui du `seq`, jamais l'horloge du client (PR #70).
- **`client_msg_id`** généré par le client (UUID), contrainte `UNIQUE (conversation_id, client_msg_id)` :
  - un renvoi par **le même expéditeur** renvoie le message déjà stocké, sans nouvelle diffusion ;
  - deux envois simultanés : le second échoue sur la contrainte, sa transaction (y compris l'incrément de `seq`) est annulée, et il reçoit le premier ;
  - un identifiant déjà utilisé par **un autre membre** est refusé (`VALIDATION_FAILED`), sans jamais renvoyer le message de quelqu'un d'autre (#74, PR #83).
- **Rattrapage** : le client retient le dernier `seq` reçu par conversation et envoie `conversation:sync { afterSeq }` à la reconnexion (200 messages maximum, puis pagination REST par `before=<seq>`).
- **Côté client** : affichage optimiste (« Envoi… »), confirmé par l'ack qui porte le `seq`. En cas d'échec, le renvoi réutilise le **même** `client_msg_id`. La fusion déduplique par `id` et par `client_msg_id` (PR #89).

## Conséquences

- Ordre identique pour tous les membres et toutes les instances ; la base reste la source de vérité, même si un client retombe sur une autre instance après une coupure.
- Les renvois sont sans risque, ce qui rend la reprise après coupure simple côté client.
- **Limite assumée** : le compteur `last_seq` **sérialise les envois d'une même conversation** (verrou de ligne pendant la transaction). C'est un goulot possible pour un très gros groupe très actif, à mesurer avec les tests de charge (#24) avant d'optimiser.
- Un message dont la transaction échoue après l'incrément ne laisse pas de trou, puisque l'incrément est annulé avec la transaction.
- La contrainte `client_msg_id` est par conversation : un client qui génère des identifiants prévisibles peut voir ses envois refusés, mais ne peut ni lire ni écraser ceux des autres.
