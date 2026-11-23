import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id (architecture § 9, NFR-04). Paramètres : recommandation OWASP « m=19 MiB, t=2, p=1 »,
 * qui sont aussi les valeurs par défaut de @node-rs/argon2. Le coût réel est à mesurer (axe performance).
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Empreinte calculée une fois, vérifiée quand l'utilisateur n'existe pas : la connexion prend
 * le même temps qu'il existe ou non, ce qui évite de révéler les noms d'utilisateur par la durée.
 */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("chatisen-timing-equalizer");
  return dummyHash;
}
