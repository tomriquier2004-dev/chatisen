import { Type, type Static } from "@sinclair/typebox";

/** Préfixe de toutes les routes REST (docs/architecture.md § 5.1). */
export const API_PREFIX = "/api/v1";

/** GET /api/v1/health/live : le processus répond (NFR-03, NFR-06). */
export const HealthLiveResponse = Type.Object(
  {
    status: Type.Literal("ok"),
    uptimeSeconds: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false, $id: "HealthLiveResponse" },
);
export type HealthLiveResponse = Static<typeof HealthLiveResponse>;
