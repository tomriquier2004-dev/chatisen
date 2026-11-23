import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  ClientToServerEvents,
  Message,
  MessageSendPayload,
  ServerToClientEvents,
} from "@chatisen/shared";
import type { ApiClient } from "./api";
import { ApiError } from "./errors";

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface RealtimeOptions {
  /** Fabrique de socket, remplaçable dans les tests. */
  createSocket?: (opts: Parameters<typeof io>[1]) => ChatSocket;
  ackTimeoutMs?: number;
}

/**
 * Client Socket.IO typé (issue #77, architecture § 5.2 et § 6.3).
 * - le token est relu à chaque (re)connexion, rafraîchi si besoin ;
 * - un refus UNAUTHENTICATED au handshake déclenche un refresh puis une nouvelle tentative ;
 * - après une reconnexion, chaque conversation suivie est rattrapée par `conversation:sync`
 *   depuis le dernier `seq` reçu, et les messages manqués passent par les mêmes abonnés que `message:new`.
 */
export class Realtime {
  readonly socket: ChatSocket;
  private readonly lastSeq = new Map<string, number>();
  private readonly messageListeners = new Set<(m: Message) => void>();
  private readonly stateListeners = new Set<(s: ConnectionState) => void>();
  private readonly resumeListeners = new Set<() => void>();
  private state: ConnectionState = "disconnected";
  private everConnected = false;
  private readonly ackTimeoutMs: number;

  constructor(
    private readonly api: ApiClient,
    opts: RealtimeOptions = {},
  ) {
    this.ackTimeoutMs = opts.ackTimeoutMs ?? 10_000;
    const socketOpts: Parameters<typeof io>[1] = {
      path: "/socket.io",
      autoConnect: false,
      transports: ["websocket"],
      auth: (cb) => {
        void api.accessToken().then((token) => cb(token ? { token } : {}));
      },
    };
    this.socket = opts.createSocket ? opts.createSocket(socketOpts) : (io(socketOpts) as ChatSocket);

    this.socket.on("connect", () => {
      const resumed = this.everConnected;
      this.everConnected = true;
      this.setState("connected");
      if (resumed) {
        void this.catchUp();
        // Les événements reçus pendant la coupure sont perdus : les abonnés rechargent leur état (#98).
        for (const l of this.resumeListeners) l();
      }
    });
    this.socket.on("disconnect", (reason) => {
      // Fermeture voulue par le serveur (logout, session révoquée) : pas de reconnexion automatique.
      this.setState(reason === "io server disconnect" || reason === "io client disconnect" ? "disconnected" : "reconnecting");
    });
    this.socket.on("connect_error", (err) => {
      if (err.message === "UNAUTHENTICATED") {
        void api.refresh().then((session) => {
          if (session) this.socket.connect();
          else this.setState("disconnected");
        });
      } else {
        this.setState("reconnecting");
      }
    });
    this.socket.on("message:new", (m) => this.deliver(m));
  }

  connect(): void {
    this.setState(this.everConnected ? "reconnecting" : "connecting");
    this.socket.connect();
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  onMessage(listener: (m: Message) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onState(listener: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  /** Appelé à chaque reconnexion (pas à la première connexion). */
  onResume(listener: () => void): () => void {
    this.resumeListeners.add(listener);
    return () => this.resumeListeners.delete(listener);
  }

  /** Suit une conversation (ouverte à l'écran) à partir du dernier seq connu. */
  track(conversationId: string, lastSeq: number): void {
    this.lastSeq.set(conversationId, Math.max(lastSeq, this.lastSeq.get(conversationId) ?? 0));
  }

  untrack(conversationId: string): void {
    this.lastSeq.delete(conversationId);
  }

  /** Envoie un message ; rejette avec une ApiError (refus du serveur ou délai dépassé). */
  async send(payload: MessageSendPayload): Promise<Message> {
    let res: Ack<Message>;
    try {
      res = (await this.socket.timeout(this.ackTimeoutMs).emitWithAck("message:send", payload)) as Ack<Message>;
    } catch {
      throw new ApiError("NETWORK_ERROR", undefined);
    }
    if (!res.ok) throw new ApiError(res.error.code, undefined, res.error.message, res.error.requestId);
    this.deliver(res.data);
    return res.data;
  }

  /** Accusé de lecture jusqu'à `seq` ; renvoie le lastReadSeq retenu par le serveur, ou null si refusé. */
  async markRead(conversationId: string, seq: number): Promise<number | null> {
    try {
      const res = (await this.socket
        .timeout(this.ackTimeoutMs)
        .emitWithAck("message:read", { conversationId, seq })) as Ack<{ lastReadSeq: number }>;
      return res.ok ? res.data.lastReadSeq : null;
    } catch {
      return null;
    }
  }

  private deliver(m: Message): void {
    if (this.lastSeq.has(m.conversationId)) this.track(m.conversationId, m.seq);
    for (const l of this.messageListeners) l(m);
  }

  private async catchUp(): Promise<void> {
    for (const [conversationId, afterSeq] of this.lastSeq) {
      try {
        const res = (await this.socket
          .timeout(this.ackTimeoutMs)
          .emitWithAck("conversation:sync", { conversationId, afterSeq })) as Ack<Message[]>;
        if (res.ok) for (const m of res.data) this.deliver(m);
      } catch {
        // La prochaine reconnexion retentera le rattrapage.
      }
    }
  }

  private setState(state: ConnectionState): void {
    if (state === this.state) return;
    this.state = state;
    for (const l of this.stateListeners) l(state);
  }
}
