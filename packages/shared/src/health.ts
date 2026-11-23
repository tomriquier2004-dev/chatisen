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

export const DependencyStatus = Type.Union([Type.Literal("up"), Type.Literal("down")]);

/**
 * GET /api/v1/health/ready : l'instance peut servir du trafic (dépendances joignables).
 * 200 si tout est « up », 503 sinon (NFR-03). Redis est absent du rapport quand l'API tourne sans
 * adapter Redis (instance unique).
 */
export const HealthReadyResponse = Type.Object(
  {
    status: Type.Union([Type.Literal("ready"), Type.Literal("not_ready")]),
    checks: Type.Object(
      { postgres: DependencyStatus, redis: Type.Optional(DependencyStatus) },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false, $id: "HealthReadyResponse" },
);
export type HealthReadyResponse = Static<typeof HealthReadyResponse>;
