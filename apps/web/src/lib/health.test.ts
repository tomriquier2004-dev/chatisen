import { describe, expect, it } from "vitest";
import { checkApiHealth } from "./health";

const respond =
  (status: number, body: unknown): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("checkApiHealth", () => {
  it("renvoie up quand la sonde répond selon le contrat", async () => {
    expect(await checkApiHealth(respond(200, { status: "ok", uptimeSeconds: 3 }))).toBe("up");
  });

  it("renvoie down sur une erreur HTTP", async () => {
    expect(await checkApiHealth(respond(502, {}))).toBe("down");
  });

  it("renvoie down sur une réponse hors contrat", async () => {
    expect(await checkApiHealth(respond(200, { status: "ok" }))).toBe("down");
  });

  it("renvoie down quand l'API est injoignable", async () => {
    const failing: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await checkApiHealth(failing)).toBe("down");
  });
});
