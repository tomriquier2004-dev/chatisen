import { Type, type Static } from "@sinclair/typebox";
import { Uuid } from "./ids";
import { ErrorCode } from "./errors";
import type { ErrorCode as ErrorCodeType } from "./errors";

/** Types de candidats ICE utiles à l'analyse des chemins directs et relayés. */
export const IceCandidateType = Type.Union([
  Type.Literal("host"),
  Type.Literal("srflx"),
  Type.Literal("relay"),
]);
export type IceCandidateType = Static<typeof IceCandidateType>;

export const CallMedia = Type.Union([Type.Literal("audio"), Type.Literal("video")]);
export type CallMedia = Static<typeof CallMedia>;

export const CallEndReason = Type.Union([
  Type.Literal("hangup"),
  Type.Literal("rejected"),
  Type.Literal("timeout"),
  Type.Literal("busy"),
  Type.Literal("removed"),
  Type.Literal("disconnected"),
  Type.Literal("failed"),
]);
export type CallEndReason = Static<typeof CallEndReason>;

/** Erreurs métier fermées retournées dans les ACK des événements d'appel. */
export const CallAckErrorCode = ErrorCode;
export type CallAckErrorCode = ErrorCodeType;

export const CallQualityParams = Type.Object({ id: Uuid }, { additionalProperties: false });
export type CallQualityParams = Static<typeof CallQualityParams>;

/** Un échantillon côté client ; l'identité du contributeur et l'horodatage sont fournis par l'API. */
export const CallQualitySampleInput = Type.Object(
  {
    observedAt: Type.String({ minLength: 20, maxLength: 40 }),
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

/** call:invite : création d'un appel privé 1-1 ; l'ACK confirme seulement la création. */
export const CallInvitePayload = Type.Object(
  { conversationId: Uuid, media: CallMedia },
  { additionalProperties: false },
);
export type CallInvitePayload = Static<typeof CallInvitePayload>;
export const CallInviteAck = Type.Object({ callId: Uuid }, { additionalProperties: false });
export type CallInviteAck = Static<typeof CallInviteAck>;

export const CallIdPayload = Type.Object({ callId: Uuid }, { additionalProperties: false });
export type CallIdPayload = Static<typeof CallIdPayload>;

export const CallHangupPayload = Type.Object(
  { callId: Uuid, reason: Type.Optional(Type.Union([Type.Literal("hangup"), Type.Literal("failed")])), negotiationFailed: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
);
export type CallHangupPayload = Static<typeof CallHangupPayload>;

export const CallIncomingEvent = Type.Object(
  { callId: Uuid, conversationId: Uuid, from: Uuid, media: CallMedia },
  { additionalProperties: false },
);
export type CallIncomingEvent = Static<typeof CallIncomingEvent>;

export const CallAcceptedEvent = Type.Object(
  { callId: Uuid, userId: Uuid },
  { additionalProperties: false },
);
export type CallAcceptedEvent = Static<typeof CallAcceptedEvent>;

export const CallEndedEvent = Type.Object(
  { callId: Uuid, reason: CallEndReason },
  { additionalProperties: false },
);
export type CallEndedEvent = Static<typeof CallEndedEvent>;

/** Les SDP sont bornés pour éviter les payloads arbitrairement volumineux. */
export const CallMediaStatePayload = Type.Object(
  { callId: Uuid, to: Uuid, cameraEnabled: Type.Boolean() },
  { additionalProperties: false },
);
export type CallMediaStatePayload = Static<typeof CallMediaStatePayload>;

export const CallMediaStateEvent = Type.Object(
  { callId: Uuid, from: Uuid, cameraEnabled: Type.Boolean() },
  { additionalProperties: false },
);
export type CallMediaStateEvent = Static<typeof CallMediaStateEvent>;

export const RtcDescriptionPayload = Type.Object(
  { callId: Uuid, to: Uuid, sdp: Type.String({ minLength: 1, maxLength: 16_384 }) },
  { additionalProperties: false },
);
export type RtcDescriptionPayload = Static<typeof RtcDescriptionPayload>;

/** Sous-ensemble RTCIceCandidateInit ; les champs optionnels restent explicitement nullables. */
export const RtcIceCandidate = Type.Object(
  {
    candidate: Type.String({ minLength: 1, maxLength: 4_096 }),
    sdpMid: Type.Optional(Type.Union([Type.String({ maxLength: 256 }), Type.Null()])),
    sdpMLineIndex: Type.Optional(Type.Union([Type.Integer({ minimum: 0, maximum: 65_535 }), Type.Null()])),
    usernameFragment: Type.Optional(Type.Union([Type.String({ maxLength: 256 }), Type.Null()])),
  },
  { additionalProperties: false },
);
export type RtcIceCandidate = Static<typeof RtcIceCandidate>;

export const RtcIceCandidatePayload = Type.Object(
  { callId: Uuid, to: Uuid, candidate: RtcIceCandidate },
  { additionalProperties: false },
);
export type RtcIceCandidatePayload = Static<typeof RtcIceCandidatePayload>;

/** Réponse de GET /turn/credentials ; le secret partagé ne fait jamais partie du DTO. */
export const TurnCredentialsResponse = Type.Object(
  {
    urls: Type.Array(Type.String({ minLength: 1, maxLength: 2_048 }), { minItems: 1, maxItems: 8 }),
    username: Type.String({ minLength: 1, maxLength: 256 }),
    credential: Type.String({ minLength: 1, maxLength: 256 }),
    ttl: Type.Integer({ minimum: 60, maximum: 86_400 }),
  },
  { additionalProperties: false },
);
export type TurnCredentialsResponse = Static<typeof TurnCredentialsResponse>;


/** ACK des événements d'appel : erreur métier explicite, sans détails internes. */
export type CallAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCodeType; message: string; requestId: string } };

/** Événements client → serveur pour les appels 1-1. */
export interface CallClientToServerEvents {
  "call:invite": (payload: CallInvitePayload, ack: (result: CallAck<CallInviteAck>) => void) => void;
  "call:accept": (payload: CallIdPayload, ack: (result: CallAck<{ callId: string }>) => void) => void;
  "call:reject": (payload: CallIdPayload, ack: (result: CallAck<{ callId: string }>) => void) => void;
  "call:hangup": (payload: CallHangupPayload, ack: (result: CallAck<{ callId: string }>) => void) => void;
  "call:media-state": (payload: CallMediaStatePayload, ack: (result: CallAck<{ relayed: true }>) => void) => void;
  "rtc:offer": (payload: RtcDescriptionPayload, ack: (result: CallAck<{ relayed: true }>) => void) => void;
  "rtc:answer": (payload: RtcDescriptionPayload, ack: (result: CallAck<{ relayed: true }>) => void) => void;
  "rtc:ice-candidate": (payload: RtcIceCandidatePayload, ack: (result: CallAck<{ relayed: true }>) => void) => void;
}

/** Événements serveur → client pour les appels 1-1. */
export interface CallServerToClientEvents {
  "call:incoming": (event: CallIncomingEvent) => void;
  "call:accepted": (event: CallAcceptedEvent) => void;
  "call:ended": (event: CallEndedEvent) => void;
  "call:media-state": (event: CallMediaStateEvent) => void;
  "rtc:offer": (event: RtcDescriptionEvent) => void;
  "rtc:answer": (event: RtcDescriptionEvent) => void;
  "rtc:ice-candidate": (event: RtcIceCandidateEvent) => void;
}


export const RtcDescriptionEvent = Type.Object(
  { callId: Uuid, from: Uuid, sdp: Type.String({ minLength: 1, maxLength: 16_384 }) },
  { additionalProperties: false },
);
export type RtcDescriptionEvent = Static<typeof RtcDescriptionEvent>;

export const RtcIceCandidateEvent = Type.Object(
  { callId: Uuid, from: Uuid, candidate: RtcIceCandidate },
  { additionalProperties: false },
);
export type RtcIceCandidateEvent = Static<typeof RtcIceCandidateEvent>;
