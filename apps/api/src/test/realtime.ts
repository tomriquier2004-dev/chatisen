import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { io as connectClient, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@chatisen/shared";
import { buildApp, type AppDeps } from "../app";
import type { Config } from "../config";
import { attachRealtime } from "../realtime";
import { RealtimeEvents } from "../realtime/events";
import type { RateLimiter } from "../plugins/rate-limit";

export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Instance {
  app: FastifyInstance;
  url: string;
  close(): Promise<void>;
}

/** Une instance d'API complète (REST + Socket.IO) sur un port libre, comme en déploiement multi-instances. */
export async function startInstance(
  config: Config,
  deps: AppDeps,
  redisUrl: string | undefined = TEST_REDIS_URL,
  rateLimit?: { limiter: RateLimiter; enabled: boolean },
): Promise<Instance> {
  // Même câblage que server.ts : les routes REST préviennent le temps réel.
  const events = new RealtimeEvents();
  const app = buildApp(config, { ...deps, membershipEvents: events, sessionEvents: events });
  await attachRealtime(app, { redisUrl, events, ...(rateLimit ? { rateLimit } : {}) });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const { port } = app.server.address() as AddressInfo;
  return { app, url: `http://127.0.0.1:${port}`, close: () => app.close() };
}

/** Client Socket.IO connecté avec un access token ; rejette si le handshake est refusé. */
export function connect(url: string, token: string | undefined): Promise<ClientSocket> {
  const socket: ClientSocket = connectClient(url, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: token === undefined ? {} : { token },
    reconnection: false,
    forceNew: true,
  });
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

/** Attend le prochain événement `event`, ou échoue après `timeoutMs`. */
export function nextEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  timeoutMs = 2000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${String(event)}`)), timeoutMs);
    socket.once(event as "message:new", ((payload: unknown) => {
      clearTimeout(timer);
      resolve(payload as Parameters<ServerToClientEvents[E]>[0]);
    }) as never);
  });
}

/** Vrai si aucun `event` n'arrive pendant `ms` : sert à prouver qu'un message N'est PAS reçu. */
export function noEvent(socket: ClientSocket, event: keyof ServerToClientEvents, ms = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const onEvent = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      socket.off(event as "message:new", onEvent);
      resolve(true);
    }, ms);
    socket.once(event as "message:new", onEvent);
  });
}
