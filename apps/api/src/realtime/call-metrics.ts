import type { CallEndReason } from "@chatisen/shared";

const END_REASONS: CallEndReason[] = ["hangup", "rejected", "timeout", "busy", "removed", "disconnected", "failed"];
const DURATION_BUCKETS = [1, 5, 10, 30, 60, 300, 900, 3600] as const;

function label(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

/** Compteurs process-local exposés au format Prometheus ; les échantillons durables restent en PostgreSQL. */
export class CallMetrics {
  private started = 0;
  private accepted = 0;
  private readonly ended = new Map<CallEndReason, number>(END_REASONS.map((reason) => [reason, 0]));
  private negotiationFailures = 0;
  private durationCount = 0;
  private durationSum = 0;
  private readonly durationBuckets = new Map<number, number>(DURATION_BUCKETS.map((bucket) => [bucket, 0]));

  recordStarted(): void { this.started += 1; }
  recordAccepted(): void { this.accepted += 1; }
  recordNegotiationFailure(): void { this.negotiationFailures += 1; }

  recordEnded(reason: CallEndReason, durationSeconds: number): void {
    this.ended.set(reason, (this.ended.get(reason) ?? 0) + 1);
    const duration = Math.max(0, Number.isFinite(durationSeconds) ? durationSeconds : 0);
    this.durationCount += 1;
    this.durationSum += duration;
    for (const bucket of DURATION_BUCKETS) {
      if (duration <= bucket) this.durationBuckets.set(bucket, (this.durationBuckets.get(bucket) ?? 0) + 1);
    }
  }

  render(): string {
    const lines = [
      "# HELP chatisen_calls_started_total Total calls created.",
      "# TYPE chatisen_calls_started_total counter",
      `chatisen_calls_started_total ${this.started}`,
      "# HELP chatisen_calls_accepted_total Total calls accepted by the callee.",
      "# TYPE chatisen_calls_accepted_total counter",
      `chatisen_calls_accepted_total ${this.accepted}`,
      "# HELP chatisen_calls_ended_total Calls ended, partitioned by terminal reason.",
      "# TYPE chatisen_calls_ended_total counter",
      ...END_REASONS.map((reason) => `chatisen_calls_ended_total{reason="${label(reason)}"} ${this.ended.get(reason) ?? 0}`),
      "# HELP chatisen_call_negotiation_failures_total Failed SDP/ICE negotiations observed by the API.",
      "# TYPE chatisen_call_negotiation_failures_total counter",
      `chatisen_call_negotiation_failures_total ${this.negotiationFailures}`,
      "# HELP chatisen_call_duration_seconds Call duration in seconds.",
      "# TYPE chatisen_call_duration_seconds histogram",
      ...DURATION_BUCKETS.map((bucket) => `chatisen_call_duration_seconds_bucket{le="${bucket}"} ${this.durationBuckets.get(bucket) ?? 0}`),
      `chatisen_call_duration_seconds_bucket{le="+Inf"} ${this.durationCount}`,
      `chatisen_call_duration_seconds_sum ${this.durationSum}`,
      `chatisen_call_duration_seconds_count ${this.durationCount}`,
    ];
    return lines.join("\n") + "\n";
  }
}

export const callMetrics = new CallMetrics();
