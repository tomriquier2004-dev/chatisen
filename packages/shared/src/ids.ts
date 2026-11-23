import { Type } from "@sinclair/typebox";

/**
 * UUID en motif plutôt qu'en `format: "uuid"` : les formats doivent être enregistrés à part dans
 * TypeBox côté client, alors qu'un motif est vérifié de la même façon par Fastify et par le navigateur.
 */
export const Uuid = Type.String({
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});
