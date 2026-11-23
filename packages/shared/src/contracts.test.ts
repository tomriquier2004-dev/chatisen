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
