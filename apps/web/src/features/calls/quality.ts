import {
  CallQualityResponse,
  type CallQualitySampleInput,
  type CallQualityRequest,
  type IceCandidateType,
} from "@chatisen/shared";
import type { ApiClient } from "../../lib/api";

export interface OutboundBaseline {
  bytesSent: number;
  timestamp: number;
}

export interface QualityExtraction {
  sample: CallQualitySampleInput | null;
  nextBaseline: OutboundBaseline | null;
}

/** Extrait les métriques réseau depuis les rapports standardisés RTCPeerConnection.getStats(). */
export function extractCallQuality(
  report: RTCStatsReport,
  observedAt = new Date(),
  previous: OutboundBaseline | null = null,
): QualityExtraction {
  const stats = [...report.values()] as Array<Record<string, unknown>>;
  const transports = stats.filter((s) => s.type === "transport");
  const transport = transports.find((s) => typeof s.selectedCandidatePairId === "string");
  const pairId = typeof transport?.selectedCandidatePairId === "string"
    ? transport.selectedCandidatePairId
    : undefined;
  const pair = pairId
    ? stats.find((s) => s.id === pairId)
    : stats.find((s) => s.type === "candidate-pair" && s.state === "succeeded" && s.nominated === true);
  if (!pair) return { sample: null, nextBaseline: previous };

  const localCandidate = stats.find((s) => s.id === pair.localCandidateId);
  const rawType = localCandidate?.candidateType;
  if (rawType !== "host" && rawType !== "srflx" && rawType !== "relay" && rawType !== "prflx") {
    return { sample: null, nextBaseline: previous };
  }
  const candidateType: IceCandidateType = rawType === "prflx" ? "srflx" : rawType;

  const inbound = stats.filter((s) => s.type === "inbound-rtp" && s.isRemote !== true);
  const packetsReceived = inbound.reduce((sum, s) => sum + finite(s.packetsReceived), 0);
  const packetsLost = inbound.reduce((sum, s) => sum + finite(s.packetsLost), 0);
  const jitterSeconds = inbound.reduce((max, s) => Math.max(max, finite(s.jitter)), 0);

  const outbound = stats.filter((s) => s.type === "outbound-rtp" && s.isRemote !== true);
  const bytesSent = outbound.reduce((sum, s) => sum + finite(s.bytesSent), 0);
  const timestamp = finite(pair.timestamp) || observedAt.getTime();
  const nextBaseline = { bytesSent, timestamp };
  const elapsedMs = previous ? timestamp - previous.timestamp : 0;
  const bitrateKbps = previous && elapsedMs > 0
    ? Math.max(0, Math.round(((bytesSent - previous.bytesSent) * 8) / elapsedMs))
    : 0;

  const sample: CallQualitySampleInput = {
    observedAt: observedAt.toISOString(),
    rttMs: Math.max(0, Math.round(finite(pair.currentRoundTripTime) * 1000)),
    jitterMs: Math.max(0, Math.round(jitterSeconds * 1000)),
    packetLossPct: packetsReceived + packetsLost > 0
      ? Math.min(100, Math.max(0, (packetsLost / (packetsReceived + packetsLost)) * 100))
      : 0,
    bitrateKbps: Math.min(100_000, bitrateKbps),
    candidateType,
  };
  return { sample, nextBaseline };
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export interface QualityCollectorOptions {
  intervalMs?: number;
  batchSize?: number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  now?: () => Date;
  onSample?: (sample: CallQualitySampleInput) => void;
}

/** Collecte toutes les 5 s, envoie des lots bornés et ne bloque jamais l'appel en cas d'échec REST. */
export class CallQualityCollector {
  private timer: ReturnType<typeof setInterval> | null = null;
  private baseline: OutboundBaseline | null = null;
  private samples: CallQualitySampleInput[] = [];
  private stopping = false;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly schedule: typeof setInterval;
  private readonly cancel: typeof clearInterval;
  private readonly now: () => Date;
  private readonly onSample?: (sample: CallQualitySampleInput) => void;

  constructor(
    private readonly api: ApiClient,
    private readonly callId: string,
    private readonly peer: RTCPeerConnection,
    options: QualityCollectorOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 5_000;
    this.batchSize = Math.min(60, Math.max(1, options.batchSize ?? 6));
    this.schedule = options.setInterval ?? setInterval;
    this.cancel = options.clearInterval ?? clearInterval;
    this.now = options.now ?? (() => new Date());
    this.onSample = options.onSample;
  }

  start(): void {
    if (this.timer || this.stopping) return;
    this.timer = this.schedule(() => void this.collect(), this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
    await this.collect();
    await this.flush();
  }

  private async collect(): Promise<void> {
    if (this.stopping && this.samples.length >= 60) return;
    try {
      const extracted = extractCallQuality(await this.peer.getStats(), this.now(), this.baseline);
      this.baseline = extracted.nextBaseline;
      if (extracted.sample) {
        this.samples.push(extracted.sample);
        this.onSample?.(extracted.sample);
      }
      if (this.samples.length >= this.batchSize) await this.flush();
    } catch {
      // Une collecte getStats manquée ne doit jamais interrompre l'appel.
    }
  }

  private async flush(): Promise<void> {
    while (this.samples.length > 0) {
      const samples = this.samples.splice(0, 60);
      try {
        await this.api.request("POST", `/calls/${this.callId}/quality`, CallQualityResponse, { samples } satisfies CallQualityRequest);
      } catch {
        // Pas de file infinie ni d'exception non gérée ; la prochaine collecte repart à neuf.
      }
    }
  }
}
