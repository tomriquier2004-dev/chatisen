# Exigences

Source : briefing *ChatISEN – Project Briefing* (DevOps 2026-2027). Chaque exigence a un identifiant stable,
référencé par les issues, PR, tests et sections du rapport.

**Portée** : `Core` = obligatoire · `Adv` = extension (choix à justifier, toutes ne sont pas attendues).

## Exigences fonctionnelles

### Gestion des utilisateurs

| ID | Exigence | Portée |
| --- | --- | --- |
| FR-01 | Authentification sécurisée | Core |
| FR-02 | Comptes et profils identifiables | Core |
| FR-03 | Accès contrôlé aux conversations et aux fonctionnalités | Core |
| FR-04 | Gestion de session sécurisée | Core |

### Messagerie

| ID | Exigence | Portée |
| --- | --- | --- |
| FR-05 | Échange de messages en temps réel | Core |
| FR-06 | Conversations privées et de groupe | Core |
| FR-07 | Messages liés à leur expéditeur et à leur conversation | Core |
| FR-08 | Historique de conversation accessible | Core |

### Voix et vidéo

| ID | Exigence | Portée |
| --- | --- | --- |
| FR-09 | Initier et recevoir des appels voix 1-1 | Core |
| FR-10 | Initier et recevoir des appels vidéo 1-1 | Core |
| FR-11 | Contrôle du micro et de la caméra | Core |
| FR-12 | Conférences de groupe (rejoindre / quitter) | Adv |
| FR-13 | Feedback sur la qualité de la communication | Adv |

### Collaboration et fiabilité

| ID | Exigence | Portée |
| --- | --- | --- |
| FR-14 | Partage de fichiers pendant les appels / conversations | Adv |
| FR-15 | Partage d'écran pendant les appels | Adv |
| FR-16 | Gestion des conversations de groupe (membres, rôles) | Core |
| FR-17 | Récupération après interruption réseau temporaire (reconnexion) | Adv |
| FR-18 | Messages d'erreur signifiants et intégrité des données | Core |

## Exigences non fonctionnelles

| ID | Exigence | Question à laquelle le rapport doit répondre |
| --- | --- | --- |
| NFR-01 | **Performance** — messagerie et appels réactifs sous charge variable | Comportement sous charge croissante ? Qu'est-ce qui affecte latence et qualité ? |
| NFR-02 | **Scalabilité** — croissance utilisateurs, conversations, conférences | Comment le système évolue-t-il avec la croissance ? |
| NFR-03 | **Disponibilité** — tolérance aux pannes partielles | Que se passe-t-il quand une partie devient indisponible ? |
| NFR-04 | **Sécurité et vie privée** — identités, sessions, conversations, données | Comment protéger identités/sessions, contrôler l'accès, protéger données en transit et au repos ? |
| NFR-05 | **Maintenabilité** — évolutif et testable | — |
| NFR-06 | **Observabilité** — état opérationnel visible (monitoring, logs) | Comment observer l'état, détecter et investiguer les pannes ? |
| NFR-07 | **Déploiement reproductible** et contraintes opérationnelles | Comment rendre le déploiement reproductible ? |

## Exigences de sécurité

À définir en phase 0 à partir du modèle de menaces (STRIDE), au format `SEC-xx`. Voir `docs/report/10-evaluation-securite.md`.

## Hors périmètre / à confirmer

À remplir après les réponses de l'encadrant (`docs/prof-qa.md`).
