import { describe, expect, it } from "vitest";
import { CallMetrics } from "./call-metrics";

describe("CallMetrics", () => {
  it("exports lifecycle counters, terminal reasons, negotiation failures and duration histogram", () => {
    const metrics = new CallMetrics();
    metrics.recordStarted();
    metrics.recordStarted();
    metrics.recordAccepted();
    metrics.recordNegotiationFailure();
    metrics.recordEnded("hangup", 12);
    metrics.recordEnded("timeout", 75);

    const output = metrics.render();
    expect(output).toContain("chatisen_calls_started_total 2");
    expect(output).toContain("chatisen_calls_accepted_total 1");
    expect(output).toContain('chatisen_calls_ended_total{reason="hangup"} 1');
    expect(output).toContain('chatisen_calls_ended_total{reason="timeout"} 1');
    expect(output).toContain("chatisen_call_negotiation_failures_total 1");
    expect(output).toContain('chatisen_call_duration_seconds_bucket{le="30"} 1');
    expect(output).toContain('chatisen_call_duration_seconds_bucket{le="300"} 2');
    expect(output).toContain("chatisen_call_duration_seconds_count 2");
  });

  it("clamps invalid duration to zero", () => {
    const metrics = new CallMetrics();
    metrics.recordEnded("failed", Number.NaN);
    expect(metrics.render()).toContain("chatisen_call_duration_seconds_sum 0");
  });
});
