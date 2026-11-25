import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, ErrorResponse, HealthLiveResponse } from "./index";

describe("ErrorResponse", () => {
  it("accepte une erreur bien formée", () => {
    const body = { error: { code: "NOT_FOUND", message: "Introuvable", requestId: "req-1" } };
    expect(Value.Check(ErrorResponse, body)).toBe(true);
  });

  it("refuse un code inconnu", () => {
    const body = { error: { code: "OOPS", message: "…", requestId: "req-1" } };
    expect(Value.Check(ErrorResponse, body)).toBe(false);
  });

  it("refuse un champ en trop (pas de fuite de détail interne)", () => {
    const body = { error: { code: "INTERNAL_ERROR", message: "…", requestId: "r", stack: "…" } };
    expect(Value.Check(ErrorResponse, body)).toBe(false);
  });

  it("couvre chaque code déclaré", () => {
    for (const code of ERROR_CODES) {
      expect(Value.Check(ErrorResponse, { error: { code, message: "m", requestId: "r" } })).toBe(true);
    }
  });
});

describe("HealthLiveResponse", () => {
  it("accepte la réponse attendue", () => {
    expect(Value.Check(HealthLiveResponse, { status: "ok", uptimeSeconds: 12.5 })).toBe(true);
  });

  it("refuse un statut autre que ok", () => {
    expect(Value.Check(HealthLiveResponse, { status: "ko", uptimeSeconds: 1 })).toBe(false);
  });
});


describe("Call signaling contracts (issue #114)", () => {
  const { CallAcceptedEvent, CallAckErrorCode, CallEndReason, CallEndedEvent, CallIdPayload,
    CallIncomingEvent, CallInviteAck, CallInvitePayload, CallMedia, RtcDescriptionPayload,
    RtcIceCandidatePayload, TurnCredentialsResponse } = await import("./calls");

  it("accepts a private-call invitation and rejects unknown fields or media types", () => {
    expect(Value.Check(CallInvitePayload, { conversationId: "123e4567-e89b-12d3-a456-426614174000", media: "audio" })).toBe(true);
    expect(Value.Check(CallInvitePayload, { conversationId: "123e4567-e89b-12d3-a456-426614174000", media: "screen" })).toBe(false);
    expect(Value.Check(CallInvitePayload, { conversationId: "123e4567-e89b-12d3-a456-426614174000", media: "video", extra: true })).toBe(false);
  });

  it("bounds SDP and ICE candidate payloads", () => {
    const base = { callId: "123e4567-e89b-12d3-a456-426614174000", to: "123e4567-e89b-12d3-a456-426614174001" };
    expect(Value.Check(RtcDescriptionPayload, { ...base, sdp: "v=0" })).toBe(true);
    expect(Value.Check(RtcDescriptionPayload, { ...base, sdp: "x".repeat(16_385) })).toBe(false);
    expect(Value.Check(RtcIceCandidatePayload, { ...base, candidate: { candidate: "candidate:1" } })).toBe(false);
    expect(Value.Check(RtcIceCandidatePayload, { ...base, candidate: { candidate: "x".repeat(4_097) } })).toBe(false);
    expect(Value.Check(RtcIceCandidatePayload, { ...base, candidate: { candidate: "candidate:1", extra: true } })).toBe(false);
  });

  it("accepts only the closed call-end reasons and acknowledgement error codes", () => {
    for (const reason of ["hangup", "rejected", "timeout", "busy", "removed", "disconnected", "failed"]) {
      expect(Value.Check(CallEndReason, reason)).toBe(true);
      expect(Value.Check(CallEndedEvent, { callId: "123e4567-e89b-12d3-a456-426614174000", reason })).toBe(true);
    }
    expect(Value.Check(CallEndReason, "unknown")).toBe(false);
    expect(Value.Check(CallAckErrorCode, "CALL_BUSY")).toBe(true);
    expect(Value.Check(CallAckErrorCode, "ADMIN_OVERRIDE")).toBe(false);
  });

  it("validates server events, action payloads and TURN credentials", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(Value.Check(CallIdPayload, { callId: id })).toBe(true);
    expect(Value.Check(CallInviteAck, { callId: id })).toBe(true);
    expect(Value.Check(CallIncomingEvent, { callId: id, conversationId: id, from: id, media: "video" })).toBe(true);
    expect(Value.Check(CallAcceptedEvent, { callId: id, userId: id })).toBe(true);
    expect(Value.Check(TurnCredentialsResponse, { urls: ["turn:turn.example.test:3478?transport=udp"], username: "123:user", credential: "signature", ttl: 3600 })).toBe(true);
    expect(Value.Check(TurnCredentialsResponse, { urls: [], username: "123:user", credential: "signature", ttl: 3600 })).toBe(false);
    expect(Value.Check(TurnCredentialsResponse, { urls: ["turn:turn.example.test"], username: "123:user", credential: "signature", ttl: 3600, secret: "leak" })).toBe(false);
  });
});
