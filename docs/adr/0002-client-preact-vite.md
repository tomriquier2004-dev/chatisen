# ADR-0002 : Client en Preact + TypeScript + Vite

- **Statut** : accepté (choix acté par l'équipe en phase 0, formalisé ici)
- **Date** : 2026-11-23
- **Auteur (domaine)** : Theo (messagerie)
- **Relecteur (autre domaine)** : à désigner (appels ou infra)
- **Exigences concernées** : NFR-01, NFR-05

## Contexte

Le client est une SPA qui affiche des conversations, des messages en temps réel et des appels WebRTC. Il doit se charger vite (premier écran de la démo, réseau d'école incertain) et rester simple à maintenir par une équipe de 4 qui découvre une partie de la stack. Le serveur ne fait pas de rendu HTML : la SPA est servie en fichiers statiques par le reverse proxy (architecture § 8.1).

## Options considérées

1. **React 19 + Vite** : écosystème le plus large, connu de tous. Mais le runtime est lourd (voir la mesure ci-dessous), pour des fonctionnalités dont nous n'avons pas besoin (Server Components, rendu concurrent avancé).
2. **Preact + Vite** : API de composants et hooks identique à React pour notre usage, runtime d'environ 4 kB gzip. Écosystème plus petit, mais `preact/compat` permet de réutiliser la plupart des bibliothèques React si besoin.
3. **Svelte / SvelteKit** : très léger aussi, mais nouveau langage de templates pour l'équipe, et SvelteKit pousse vers un serveur Node de rendu que nous ne voulons pas.
4. **Next.js** : orienté rendu serveur et déploiement sur sa propre plateforme, hors sujet pour une SPA servie par Caddy.

Pour l'outil de build, Vite s'impose : démarrage instantané en dev, proxy intégré vers l'API (`/api`, `/socket.io`), build de production optimisé, plugin Preact officiel.

## Mesure

Même petite application dans les deux bibliothèques (formulaire contrôlé, liste filtrée de 100 éléments, compteur), build de production Vite 8.3.8, 2026-11-23 :

| Variante | JS minifié | JS gzip |
| --- | --- | --- |
| Preact 11.2.0 | 14,6 kB | **6,3 kB** |
| React 19.3.1 + react-dom | 220,1 kB | **68,9 kB** |

À fonctionnalité égale, le runtime React pèse **environ 11 fois plus** une fois compressé. Pour référence, le client ChatISEN complet (écrans de connexion et de chat, Socket.IO, validation TypeBox, PR #89) pèse 147 kB, soit 43 kB gzip : avec React, le seul runtime dépasserait ce total.

Méthode : deux projets Vite minimaux, mêmes composants (seuls changent `onInput` / `onChange` et `for` / `htmlFor`), `vite build`, tailles rapportées par Vite. **Limites** : une seule application jouet, pas de mesure du temps d'exécution ni du Time to Interactive ; la différence relative diminue quand le code applicatif grossit.

## Décision

**Preact + TypeScript + Vite.** Critère principal : le poids du client, mesuré ci-dessus, à fonctionnalités égales pour notre usage (composants, hooks, rendu de listes). TypeScript strict pour partager les contrats avec l'API (`packages/shared`, ADR-0005).

## Conséquences

- Les exemples React s'appliquent presque tels quels. Différences à connaître : `class` au lieu de `className`, `onInput` pour les champs, types JSX de Preact (les types d'attributs sont plus stricts, par exemple pour `type` et `autocomplete` des `<input>`).
- Pas de bibliothèque d'état ni de routeur pour l'instant : des abonnements simples suffisent (client API, `Realtime`). À revoir si le nombre d'écrans augmente.
- Le gros du bundle vient maintenant de nos dépendances (`socket.io-client`, validation TypeBox) et non du framework : c'est là qu'il faudra optimiser si besoin (axe performance #24).
- Si une bibliothèque React indispensable ne fonctionne pas avec `preact/compat`, il faudra réévaluer.
