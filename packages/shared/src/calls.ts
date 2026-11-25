import { Type, type Static } from "@sinclair/typebox";
import { Uuid } from "./ids";

/** Types de candidats ICE utiles à l'analyse des chemins directs et relayés. */
export const IceCandidateType = Type.Union([
  Type.Literal("host"),
  Type.Literal("srflx"),
  Type.Literal("relay"),
]);
export type IceCandidateType = Static<typeof IceCandidateType>;

export const CallQualityParams = Type.Object({ id: Uuid }, { additionalProperties: false });
export type CallQualityParams = Static<typeof CallQualityParams>;

/** Un échantillon côté client ; l'identité du contributeur et l'horodatage sont fournis par l'API. */
export const CallQualitySampleInput = Type.Object(
  {
    rttMs: Type.Number({ minimum: 0, maximum: 300_000 }),
    jitterMs: Type.Number({ minimum: 0, maximum: 60_000 }),
    packetLossPct: Type.Number({ minimum: 0, maximum: 100 }),
    bitrateKbps: Type.Integer({ minimum: 0, maximum: 100_000 }),
    candidateType: IceCandidateType,
  },
  { additionalProperties: false },
);
export type CallQualitySampleInput = Static<typeof CallQualitySampleInput>;

export const CallQualityRequest = Type.Object(
  { samples: Type.Array(CallQualitySampleInput, { minItems: 1, maxItems: 60 }) },
  { additionalProperties: false },
);
export type CallQualityRequest = Static<typeof CallQualityRequest>;

export const CallQualityResponse = Type.Object(
  { accepted: Type.Integer({ minimum: 1, maximum: 60 }) },
  { additionalProperties: false },
);
export type CallQualityResponse = Static<typeof CallQualityResponse>;
