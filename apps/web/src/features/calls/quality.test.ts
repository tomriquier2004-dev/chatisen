import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../lib/api";
import { CallQualityCollector, extractCallQuality } from "./quality";

function report(overrides: Record<string, unknown> = {}): RTCStatsReport {
  const values = [
    { id: "pair", type: "candidate-pair", state: "succeeded", nominated: true, currentRoundTripTime: 0.05, timestamp: 10_000, localCandidateId: "local" },
    { id: "local", type: "local-candidate", candidateType: "relay" },
    { id: "inbound", type: "inbound-rtp", packetsReceived: 900, packetsLost: 100, jitter: 0.02 },
    { id: "outbound", type: "outbound-rtp", bytesSent: 100_000 },
    ...Object.entries(overrides).map(([id, value]) => ({ id, ...value as object })),
  ];
  return new Map(values.map((value) => [value.id, value])) as unknown as RTCStatsReport;
}

describe("extractCallQuality", () => {
  it("calcule RTT, jitter, perte, débit et type relay depuis la paire sélectionnée", () => {
    const result = extractCallQuality(report(), new Date("2026-11-25T10:00:00.000Z"), {
      bytesSent: 50_000,
      timestamp: 5_000,
    });
    expect(result.sample).toEqual({
      observedAt: "2026-11-25T10:00:00.000Z",
      rttMs: 50,
      jitterMs: 20,
      packetLossPct: 10,
      bitrateKbps: 80,
      candidateType: "relay",
    });
    expect(result.nextBaseline).toEqual({ bytesSent: 100_000, timestamp: 10_000 });
  });

  it("ramène prflx à srflx et ne fabrique pas de type quand aucune paire n'est sélectionnée", () => {
    const prflx = report({ local: { type: "local-candidate", candidateType: "prflx" } });
    expect(extractCallQuality(prflx).sample?.candidateType).toBe("srflx");
    const noPair = new Map([["local", { id: "local", type: "local-candidate", candidateType: "host" }]]) as unknown as RTCStatsReport;
    expect(extractCallQuality(noPair).sample).toBeNull();
  });
});

describe("CallQualityCollector", () => {
  it("envoie un lot à la limite configurée et vide le dernier lot au raccrochage", async () => {
    let tick: (() => void) | undefined;
    const api = { request: vi.fn(async () => ({ accepted: 1 })) };
    const peer = { getStats: vi.fn(async () => report()) } as unknown as RTCPeerConnection;
    const collector = new CallQualityCollector(
      api as unknown as ApiClient,
      "call-1",
      peer,
      {
        batchSize: 2,
        setInterval: ((callback: TimerHandler) => {
          tick = callback as () => void;
          return 1 as unknown as ReturnType<typeof setInterval>;
        }) as unknown as typeof setInterval,
        clearInterval: vi.fn() as unknown as typeof clearInterval,
        now: () => new Date("2026-11-25T10:00:00.000Z"),
      },
    );
    collector.start();
    await tick?.();
    await tick?.();
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith("POST", "/calls/call-1/quality", expect.anything(), {
      samples: expect.arrayContaining([expect.objectContaining({ candidateType: "relay" })]),
    });
    await tick?.();
    await collector.stop();
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(peer.getStats).toHaveBeenCalledTimes(4);
  });

  it("ignore les erreurs getStats et les erreurs REST", async () => {
    const api = { request: vi.fn().mockRejectedValue(new Error("offline")) };
    const peer = { getStats: vi.fn().mockRejectedValue(new Error("stats unavailable")) } as unknown as RTCPeerConnection;
    const collector = new CallQualityCollector(api as unknown as ApiClient, "call-1", peer);
    collector.start();
    await collector.stop();
    expect(api.request).not.toHaveBeenCalled();
  });
});
