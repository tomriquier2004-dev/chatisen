import { useEffect, useState } from "preact/hooks";
import type { InputHTMLAttributes } from "preact";
import { LoginRequest, RegisterRequest } from "@chatisen/shared";
import { api } from "../../app/services";
import { ApiError } from "../../lib/errors";
import { fieldErrors } from "../../lib/validation";
import { ThemeToggle } from "../theme/ThemeToggle";
import styles from "./Auth.module.css";
import { MICROSOFT_START_URL, takeMicrosoftError } from "./microsoft";

type Mode = "login" | "register";

const REGISTER_FIELDS = {
  username: "3 à 32 caractères : lettres, chiffres, « _ », « . » ou « - ».",
  email: "Adresse e-mail invalide.",
  displayName: "Entre 1 et 64 caractères.",
  password: "8 caractères minimum (128 maximum).",
};

/** Erreurs de l'API rattachées à un champ du formulaire d'inscription. */
const FIELD_OF_CODE: Partial<Record<string, keyof typeof REGISTER_FIELDS>> = {
  USERNAME_TAKEN: "username",
  EMAIL_TAKEN: "email",
};

/** Écrans de connexion et d'inscription (issue #78, FR-01, FR-02, FR-18) ; connexion Microsoft (ADR-0020). */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [microsoft, setMicrosoft] = useState(false);
  const [microsoftError] = useState(takeMicrosoftError);

  useEffect(() => {
    let active = true;
    void api.providers().then((p) => active && setMicrosoft(p.microsoft));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main class={styles.page}>
      <ThemeToggle class={styles.theme} />
      <section class={styles.card} aria-labelledby="auth-title">
        <div class={styles.brand}>
          <span class={styles.logo} aria-hidden="true">
            C
          </span>
          <h1 id="auth-title" class={styles.title}>
            ChatISEN
          </h1>
        </div>
        {microsoft ? (
          <div class={styles.external}>
            <a class={styles.secondary} href={MICROSOFT_START_URL}>
              <MicrosoftLogo />
              Continuer avec Microsoft
            </a>
            <p class={styles.separator}>ou</p>
          </div>
        ) : null}
        <FormError message={microsoftError} />
        <div class={styles.tabs} role="tablist" aria-label="Choix du formulaire">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              id={`tab-${m}`}
              aria-selected={mode === m}
              aria-controls={`panel-${m}`}
              class={mode === m ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setMode(m)}
            >
              {m === "login" ? "Connexion" : "Inscription"}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`}>
          {mode === "login" ? <LoginForm /> : <RegisterForm />}
        </div>
      </section>
    </main>
  );
}

function LoginForm() {
  const [values, setValues] = useState({ username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    // Pas de règle de format ici : un identifiant mal formé échoue comme un mauvais mot de passe.
    if (Object.keys(fieldErrors(LoginRequest, values, { username: "x", password: "x" })).length > 0) {
      setError("Saisissez votre nom d'utilisateur et votre mot de passe.");
      return;
    }
    setBusy(true);
    try {
      await api.login(values);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class={styles.form} onSubmit={submit} noValidate>
      <Field
        id="login-username"
        label="Nom d'utilisateur"
        autocomplete="username"
        value={values.username}
        onInput={(v) => setValues({ ...values, username: v })}
      />
      <Field
        id="login-password"
        label="Mot de passe"
        type="password"
        autocomplete="current-password"
        value={values.password}
        onInput={(v) => setValues({ ...values, password: v })}
      />
      <FormError message={error} />
      <button class={styles.primary} type="submit" disabled={busy}>
        {busy ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

function RegisterForm() {
  const [values, setValues] = useState({ username: "", email: "", displayName: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof REGISTER_FIELDS, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    const found = fieldErrors(RegisterRequest, values, REGISTER_FIELDS);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await api.register(values);
    } catch (err) {
      if (err instanceof ApiError && FIELD_OF_CODE[err.code]) {
        setErrors({ [FIELD_OF_CODE[err.code]!]: err.message });
      } else {
        setError(err instanceof ApiError ? err.message : "Inscription impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  const set = (field: keyof typeof values) => (v: string) => setValues({ ...values, [field]: v });

  return (
    <form class={styles.form} onSubmit={submit} noValidate>
      <Field id="reg-username" label="Nom d'utilisateur" autocomplete="username" value={values.username} onInput={set("username")} error={errors.username} hint={REGISTER_FIELDS.username} />
      <Field id="reg-email" label="Adresse e-mail" type="email" autocomplete="email" value={values.email} onInput={set("email")} error={errors.email} />
      <Field id="reg-display" label="Nom affiché" autocomplete="nickname" value={values.displayName} onInput={set("displayName")} error={errors.displayName} />
      <Field id="reg-password" label="Mot de passe" type="password" autocomplete="new-password" value={values.password} onInput={set("password")} error={errors.password} hint={REGISTER_FIELDS.password} />
      <FormError message={error} />
      <button class={styles.primary} type="submit" disabled={busy}>
        {busy ? "Création…" : "Créer mon compte"}
      </button>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onInput: (value: string) => void;
  type?: "text" | "password" | "email";
  autocomplete?: "username" | "current-password" | "new-password" | "email" | "nickname";
  error?: string | undefined;
  hint?: string;
}

/** Champ étiqueté ; l'erreur et l'aide sont reliées au champ pour les lecteurs d'écran. */
function Field({ id, label, value, onInput, type = "text", autocomplete, error, hint }: FieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(" ");
  // Les types de Preact distinguent chaque valeur de `type` ; un seul objet d'attributs garde le composant simple.
  const inputProps = {
    id,
    class: error ? `${styles.input} ${styles.inputError}` : styles.input,
    type,
    value,
    autocomplete,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
    onInput: (e: Event) => onInput((e.currentTarget as HTMLInputElement).value),
  } as InputHTMLAttributes<HTMLInputElement>;
  return (
    <div class={styles.field}>
      <label class={styles.label} for={id}>
        {label}
      </label>
      <input {...inputProps} />
      {error ? (
        <p id={`${id}-error`} class={styles.fieldError}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} class={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  return (
    <p class={styles.formError} role="alert" aria-live="assertive">
      {message ?? ""}
    </p>
  );
}

/** Logo à quatre carrés, aux couleurs officielles de Microsoft (décoratif : le texte du lien suffit). */
function MicrosoftLogo() {
  return (
    <svg class={styles.providerLogo} viewBox="0 0 21 21" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
