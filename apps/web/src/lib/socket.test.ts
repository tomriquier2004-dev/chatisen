import { describe, expect, it, vi } from "vitest";
import type { Message } from "@chatisen/shared";
import type { ApiClient } from "./api";
import { Realtime, type ChatSocket } from "./socket";

const CONV = "22222222-2222-4222-8222-222222222222";
const msg = (seq: number): Message => ({
  id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
  conversationId: CONV,
  senderId: "11111111-1111-4111-8111-111111111111",
  seq,
  clientMsgId: `33333333-3333-4333-8333-${String(seq).padStart(12, "0")}`,
  body: `m${seq}`,
  createdAt: new Date(0).toISOString(),
});

/** Socket factice : on déclenche ses événements à la main et on répond aux acks. */
function fakeSocket(acks: Record<string, (payload: unknown) => unknown>) {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const emitted: Array<[string, unknown]> = [];
  const socket = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on(event: string, fn: (...args: unknown[]) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
      return socket;
    },
    timeout: () => ({
      emitWithAck: async (event: string, payload: unknown) => {
        emitted.push([event, payload]);
        return acks[event]?.(payload);
      },
    }),
  };
  const fire = (event: string, ...args: unknown[]) => handlers.get(event)?.forEach((h) => h(...args));
  return { socket: socket as unknown as ChatSocket, fire, emitted };
}

const fakeApi = (refreshResult: unknown = { accessToken: "t2" }) =>
  ({ accessToken: async () => "t1", refresh: vi.fn(async () => refreshResult) }) as unknown as ApiClient;

describe("Realtime", () => {
  it("après une reconnexion, rattrape les messages manqués depuis le dernier seq reçu", async () => {
    const { socket, fire, emitted } = fakeSocket({
      "conversation:sync": () => ({ ok: true, data: [msg(3), msg(4)] }),
    });
    const rt = new Realtime(fakeApi(), { createSocket: () => socket });
    const received: number[] = [];
    rt.onMessage((m) => received.push(m.seq));
    rt.track(CONV, 1);

    fire("connect");
    fire("message:new", msg(2));
    fire("disconnect", "transport close");
    fire("connect");
    await vi.waitFor(() => expect(received).toEqual([2, 3, 4]));
    expect(emitted).toContainEqual(["conversation:sync", { conversationId: CONV, afterSeq: 2 }]);
  });

  it("rafraîchit le token puis se reconnecte quand le handshake est refusé", async () => {
    const { socket, fire } = fakeSocket({});
    const api = fakeApi();
    new Realtime(api, { createSocket: () => socket });
    fire("connect_error", new Error("UNAUTHENTICATED"));
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1));
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it("passe à « disconnected » si le refresh échoue, sans boucle de reconnexion", async () => {
    const { socket, fire } = fakeSocket({});
    const rt = new Realtime(fakeApi(null), { createSocket: () => socket });
    const states: string[] = [];
    rt.onState((s) => states.push(s));
    fire("connect_error", new Error("UNAUTHENTICATED"));
    await vi.waitFor(() => expect(states.at(-1)).toBe("disconnected"));
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("transforme un refus du serveur en ApiError lisible", async () => {
    const { socket } = fakeSocket({
      "message:send": () => ({ ok: false, error: { code: "CONVERSATION_FORBIDDEN", message: "m", requestId: "r" } }),
    });
    const rt = new Realtime(fakeApi(), { createSocket: () => socket });
    await expect(
      rt.send({ conversationId: CONV, clientMsgId: msg(1).clientMsgId, body: "x" }),
    ).rejects.toMatchObject({ code: "CONVERSATION_FORBIDDEN", message: "Vous ne faites pas partie de cette conversation." });
  });

  it("une déconnexion décidée par le serveur (logout) ne passe pas en reconnexion", () => {
    const { socket, fire } = fakeSocket({});
    const rt = new Realtime(fakeApi(), { createSocket: () => socket });
    const states: string[] = [];
    rt.onState((s) => states.push(s));
    fire("connect");
    fire("disconnect", "io server disconnect");
    expect(states.at(-1)).toBe("disconnected");
  });
});
