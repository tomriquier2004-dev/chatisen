# Rapport : poids du bundle, Preact contre React

> Sert l'[ADR-0002](../adr/0002-client-preact-vite.md) · issue #65 · NFR-01

## Objectif

Mesurer, à fonctionnalité égale, le poids du JavaScript livré au navigateur avec Preact et avec React, pour justifier le choix du client.

## Méthodologie

Deux projets Vite minimaux, avec le même composant (formulaire contrôlé, liste filtrée de 100 éléments, compteur). Seules différences : `onInput` / `onChange` et `for` / `htmlFor`.

```jsx
import { useMemo, useState } from "preact/hooks"; // "react" pour la variante React
const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Conversation ${i}` }));
export function App() {
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(0);
  const visible = useMemo(() => items.filter((it) => it.name.includes(query)), [query]);
  return (
    <main>
      <h1>Bench</h1>
      <label for="q">Recherche</label>
      <input id="q" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      <button onClick={() => setCount(count + 1)}>Envoyés : {count}</button>
      <ul>{visible.map((it) => <li key={it.id}>{it.name}</li>)}</ul>
    </main>
  );
}
```

Point d'entrée : `render(<App />, …)` (Preact) ou `createRoot(…).render(<App />)` (React). Build de production `vite build` (Vite 8.3.8, `@preact/preset-vite` 2.10.6, `@vitejs/plugin-react`), tailles telles que rapportées par Vite. Mesure du 2026-11-23, sur le poste de développement (Windows 11, Node 26).

## Résultats

| Variante | JS minifié | JS gzip |
| --- | --- | --- |
| Preact 11.2.0 | 14,6 kB | 6,3 kB |
| React 19.3.1 + react-dom 19.3.1 | 220,1 kB | 68,9 kB |

React pèse environ **11 fois plus** une fois compressé.

À titre de comparaison, le client ChatISEN complet (connexion, chat, Socket.IO, validation TypeBox ; PR #89) pèse **146,5 kB minifié, soit 43,3 kB gzip**.

## Limites

- Une seule application jouet. L'écart relatif diminue quand le code applicatif grossit, mais l'écart absolu (environ 60 kB gzip) reste.
- Seul le poids est mesuré, pas le temps d'analyse et d'exécution ni le Time to Interactive. Une mesure Lighthouse sur le vrai client reste à faire (axe performance #24).
- Une seule exécution. Le build est déterministe, donc la variance est négligeable pour la taille.
