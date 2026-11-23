import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * Validation côté client avec **les mêmes schémas que l'API** (`@chatisen/shared`), pour un retour
 * immédiat ; l'API revalide toujours (le client n'est pas une frontière de confiance).
 * Renvoie un message par champ fautif, pris dans `messages` (une phrase claire par champ,
 * plutôt que le message technique de TypeBox).
 */
export function fieldErrors<F extends string>(
  schema: TSchema,
  value: Record<F, unknown>,
  messages: Record<F, string>,
): Partial<Record<F, string>> {
  const errors: Partial<Record<F, string>> = {};
  for (const error of Value.Errors(schema, value)) {
    const field = error.path.split("/")[1] as F | undefined;
    if (field && field in messages && !errors[field]) errors[field] = messages[field];
  }
  return errors;
}
