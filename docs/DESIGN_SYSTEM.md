# Design System — ChatISEN

> **Version** : 1.0 (Initiale)  
> **Plateforme cible** : Ordinateur (Desktop-first, écrans $\ge 1024\text{px}$)  
> **Identité** : Jeune, communautaire, dynamique et sans friction.

---

## 1. Principes directeurs

1. **Communication, sans friction** : L'interface s'efface au profit de l'échange. La hiérarchie visuelle guide immédiatement l'œil vers les conversations actives et les actions essentielles.
2. **Respiration et clarté (Densité très aérée)** : Des marges généreuses, des séparations nettes et une absence de surcharge cognitive.
3. **Le jaune comme signature, jamais comme bruit** : Le doré `#F4C842` incarne l'identité ISEN et signale les actions principales ou les repères d'identité. Il n'est jamais utilisé comme couleur de fond massive.
4. **Sobriété structurée** : Des cartes et boutons aux contours nets (`1px`), des rayons de bordure modérés (`8px` à `12px`) et des ombres quasi inexistantes.
5. **Séparation stricte des contextes** : L'expérience utilisateur (Messagerie, Contacts, Profil, Appels) est visuellement et fonctionnellement isolée de l'espace d'Administration réservé aux développeurs.

---

## 2. Couleurs & Tokens

Le thème **Clair** est actif par défaut. L'architecture des variables CSS prévoit les tokens pour un thème **Sombre** ultérieur sans modification des composants.

### 2.1 Palette Principale & Surfaces

| Token CSS | Rôle | Valeur (Clair) | Aperçu / Usage |
| :--- | :--- | :--- | :--- |
| `--color-brand-primary` | Jaune principal (Doré) | `#F4C842` | Boutons d'action principaux (CTA), logo, repères actifs |
| `--color-brand-hover` | Jaune principal (Survol) | `#E5B832` | État `:hover` des actions principales |
| `--color-brand-soft` | Crème (Accent doux) | `#FDF6DC` | Sélection légère, surbrillance douce, badges d'identité |
| `--color-brand-ink` | Texte sur jaune | `#18181B` | Contraste élevé ($\text{AAA}$) sur fond `#F4C842` |
| `--color-bg-canvas` | Gris chaud (Fond général) | `#F6F5F2` | Arrière-plan global de l'application et de la sidebar |
| `--color-bg-surface` | Blanc (Surfaces) | `#FFFFFF` | Zone de conversation, cartes, modales, panneaux |
| `--color-bg-subtle` | Surface secondaire | `#EFECE6` | États de survol neutres, champs de saisie |

### 2.2 Typographie & Bordures

| Token CSS | Rôle | Valeur (Clair) | Usage |
| :--- | :--- | :--- | :--- |
| `--color-text-primary` | Charbon (Texte principal) | `#18181B` | Titres, corps de messages, libellés actifs |
| `--color-text-secondary` | Texte secondaire | `#52525B` | Aperçus de messages, métadonnées, sous-titres |
| `--color-text-muted` | Texte discret | `#8E8E98` | Horodatages, placeholders, états inactifs |
| `--color-border-subtle` | Bordure discrète | `#E4E2DC` | Séparateurs de panneaux, contours de cartes |
| `--color-border-strong` | Bordure active | `#D0CDC4` | Contours d'inputs au focus neutre, boutons secondaires |

### 2.3 Palette Secondaire & Sémantique (Utilisée avec modération)

Utilisée exclusivement pour les statuts de présence, la qualité d'appel, l'état des services techniques et la différenciation sobre des avatars.

| Token CSS | Rôle | Valeur | Usage |
| :--- | :--- | :--- | :--- |
| `--color-status-success` | Vert Émeraude | `#16A34A` | En ligne, qualité d'appel excellente, service opérationnel |
| `--color-status-success-bg` | Fond succès doux | `#DCFCE7` | Pastilles de statut positif |
| `--color-status-warning` | Ambre | `#D97706` | Qualité d'appel moyenne, alerte modérée, latence dégradée |
| `--color-status-warning-bg` | Fond alerte doux | `#FEF3C7` | Pastilles d'avertissement |
| `--color-status-danger` | Corail / Rouge | `#DC2626` | Raccrocher, suppression, qualité faible, service hors-ligne |
| `--color-status-danger-bg` | Fond danger doux | `#FEE2E2` | Pastilles d'erreur critique |
| `--color-status-info` | Bleu Ardoise | `#2563EB` | Badges développeur / administration, liens Grafana |
| `--color-status-info-bg` | Fond info doux | `#DBEAFE` | Étiquettes techniques |

### 2.4 Architecture Thème Sombre (Préparée)

```css
[data-theme="dark"] {
  --color-bg-canvas: #121214;
  --color-bg-surface: #1A1A1E;
  --color-bg-subtle: #242429;
  --color-text-primary: #F4F4F5;
  --color-text-secondary: #A1A1AA;
  --color-text-muted: #71717A;
  --color-border-subtle: #27272A;
  --color-brand-soft: rgba(244, 200, 66, 0.14);
}
```

---

## 3. Typographie

La famille typographique unique est **Geist** (accompagnée de **Geist Mono** pour les identifiants techniques, logs et métriques dans l'espace administration).

| Style | Famille | Taille | Hauteur de ligne | Graisse | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Display / H1` | Geist | `22px` (`1.375rem`) | `28px` | `600` (SemiBold) | Titres de vues principales, en-tête Administration |
| `Heading / H2` | Geist | `16px` (`1rem`) | `24px` | `600` (SemiBold) | Nom de la conversation active, titres de modales |
| `Section Label` | Geist | `11px` (`0.6875rem`) | `16px` | `600` (SemiBold) | Catégories sidebar (`PRIVÉES`, `GROUPES`), uppercase, tracking `+0.06em` |
| `Body / Message` | Geist | `14.5px` (`0.906rem`) | `22px` | `400` (Regular) | Corps des messages et contenus courants |
| `UI / Control` | Geist | `13.5px` (`0.844rem`) | `20px` | `500` (Medium) | Boutons, éléments de liste, onglets |
| `Caption / Meta` | Geist | `12px` (`0.75rem`) | `16px` | `400` (Regular) | Horodatages, rôles, indications de statut |
| `Code / Log` | Geist Mono | `12px` (`0.75rem`) | `18px` | `400` (Regular) | `requestId`, logs `pino`, identifiants de session |

---

## 4. Espacements, Densité & Structure

* **Unité de base** : Grille de `4px`.
* **Marges internes des panneaux** : `24px` à `32px` dans les zones principales pour garantir une respiration visuelle constante.
* **Espacement entre groupes de messages** : `20px` entre deux interlocuteurs différents ; `4px` entre deux messages consécutifs du même auteur.
* **Rayons de bordure** :
  * Boutons, champs de saisie, éléments de liste : `8px`
  * Cartes, modales, conteneurs vidéo : `12px`
  * Badges de non-lus et statuts : `9999px` (pilule)
* **Bordures** : `1px solid var(--color-border-subtle)` privilégiée sur les ombres portées.

---

## 5. Composants Clés & Règles Métiers

### 5.1 Navigation & Sidebar Rétractable
* **Largeur déployée** : `296px`.
* **Largeur rétractée** : `76px` (affiche uniquement les icônes de navigation, l'avatar unique de chaque conversation et le badge numérique de non-lus).
* **Bouton d'action unique** : `+ Créer une conversation` placé en tête de sidebar (fond `#F4C842`, texte `#18181B`). Ouvre une modale proposant explicitement le choix entre **Conversation privée** et **Groupe**.

### 5.2 Liste des Conversations & Notifications
* **Catégorisation stricte** : Deux sections distinctes et repliables : **Privées** et **Groupes**.
* **Avatars de groupe** : **Aucun avatar empilé.** Chaque groupe possède un avatar carré aux coins arrondis (`10px`) affichant soit une icône thématique sobre, soit les initiales du groupe sur un fond pastel cohérent.
* **Notifications** : Uniquement représentées par un **badge numérique de messages non lus** (pilule dorée `#F4C842` ou sombre sobre avec compteur). Aucune pastille animée ni bannière intrusive.

### 5.3 Flux de Messages (Sans bulles massives)
* Les messages adoptent une présentation éditoriale épurée, alignée à gauche, sans bulles colorées massives :
  * **Avatar** (`36px`) + **Nom d'affichage** + **Horodatage discret** sur la ligne d'en-tête.
  * **Corps du texte** directement sur la surface blanche (`--color-bg-surface`), limité à une largeur maximale de `72ch` pour un confort de lecture optimal.
  * Les messages de l'utilisateur courant sont distingués par un léger repère latéral doré (`2px solid #F4C842`) ou une mention `Vous` discrète, conservant une harmonie visuelle totale.
  * États de livraison discrets (ex. : *Envoi…* puis horodatage confirmé via `seq` serveur).

### 5.4 Interface d'Appel (Remplacement de la conversation)
* Lorsqu'un appel audio ou vidéo est actif, **la zone de conversation est intégralement remplacée** par la scène d'appel.
* **Indicateur de qualité** : Un badge simple et lisible en haut de l'écran traduit l'état de la connexion WebRTC sans aucune donnée technique (pas de RTT, jitter ou perte de paquets exposés) :
  * `● Qualité : Excellente` (Vert)
  * `● Qualité : Correcte` (Ambre)
  * `● Qualité : Instable` (Rouge)
* **Barre de contrôles** : Centrée en bas de scène, regroupant 4 actions sobres :
  1. **Microphone** (Activer / Couper)
  2. **Caméra** (Activer / Couper)
  3. **Partage d'écran** (Démarrer / Arrêter)
  4. **Raccrocher** (Bouton rouge `#DC2626` mettant fin à l'appel et restaurant la conversation)

### 5.5 Espace Administration (Développeurs)
* Accessible uniquement aux comptes disposant du rôle développeur/administrateur, présenté comme un **environnement séparé** (`ChatISEN Admin`).
* **Périmètre intégré à ChatISEN** :
  * Gestion des utilisateurs (consultation, suspension, suppression) et des rôles administrateurs.
  * Vue globale des conversations (métadonnées et volumétrie) et statistiques synthétiques.
  * État de santé des briques d'architecture (`API Fastify`, `PostgreSQL`, `Redis`, `coturn`).
  * Consultation rapide des logs structurés (`pino`) et résumé des alertes.
* **Délégation vers Grafana** : Des boutons d'accès direct (`Ouvrir dans Grafana ↗`) renvoient vers les tableaux de bord Prometheus/Loki pour l'observabilité approfondie, évitant toute duplication d'outils spécialisés.