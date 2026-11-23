import { useEffect, useState } from "preact/hooks";
import { UserSearchResponse, type PublicUser } from "@chatisen/shared";
import { api } from "../../app/services";
import { ApiError } from "../../lib/errors";
import styles from "./Conversations.module.css";

/**
 * Recherche d'utilisateurs (`GET /users?query=`, 2 caractères minimum, 300 ms après la frappe).
 * `exclude` retire les personnes déjà choisies ou déjà membres.
 */
export function UserSearch({
  id,
  label,
  exclude,
  onPick,
}: {
  id: string;
  label: string;
  exclude: Set<string>;
  onPick: (user: PublicUser) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      api
        .request("GET", `/users?query=${encodeURIComponent(q)}`, UserSearchResponse)
        .then((users) => {
          if (!active) return;
          setResults(users);
          setError(null);
        })
        .catch((err: unknown) => active && setError(err instanceof ApiError ? err.message : "Recherche impossible."));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const visible = results.filter((u) => !exclude.has(u.id));

  return (
    <div class={styles.search}>
      <label class={styles.label} for={id}>
        {label}
      </label>
      <input
        id={id}
        class={styles.input}
        type="search"
        autocomplete="off"
        placeholder="Nom ou nom d'utilisateur (2 caractères min.)"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      {error && (
        <p class={styles.error} role="alert">
          {error}
        </p>
      )}
      {query.trim().length >= 2 && (
        <ul class={styles.results} aria-label="Résultats de la recherche">
          {visible.length === 0 ? (
            <li class={styles.muted}>Aucun résultat.</li>
          ) : (
            visible.map((u) => (
              <li key={u.id}>
                <button type="button" class={styles.result} onClick={() => onPick(u)}>
                  <span>{u.displayName}</span>
                  <span class={styles.muted}>@{u.username}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
