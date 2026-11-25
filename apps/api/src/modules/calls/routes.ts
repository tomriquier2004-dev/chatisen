import type { FastifyInstance, onRequestAsyncHookHandler } from "fastify";
import { CallQualityParams, CallQualityRequest, CallQualityResponse } from "@chatisen/shared";
import { AppError, forbidden, notFound } from "../../errors";
import { requireAuth } from "../../plugins/authenticate";
import { RATE_RULES, rateLimit, type RateLimiter } from "../../plugins/rate-limit";

export interface CallRoutesOptions {
  authenticate: onRequestAsyncHookHandler;
  limits: { limiter: RateLimiter; enabled: boolean };
}

/** Routes REST liées aux appels. Les mesures sont toujours attribuées à l'utilisateur authentifié. */
export async function callRoutes(app: FastifyInstance, opts: CallRoutesOptions): Promise<void> {
  const db = app.db;
  app.addHook("onRequest", opts.authenticate);
  const limitQuality = rateLimit(opts.limits.limiter, opts.limits.enabled, RATE_RULES.callQualityPerUser);

  app.post(
    "/calls/:id/quality",
    {
      preHandler: limitQuality,
      schema: {
        params: CallQualityParams,
        body: CallQualityRequest,
        response: { 202: CallQualityResponse },
      },
    },
    async (request, reply): Promise<CallQualityResponse> => {
      const { userId } = requireAuth(request);
      const { id: callId } = request.params as CallQualityParams;
      const { samples } = request.body as CallQualityRequest;

      const call = await db
        .selectFrom("calls")
        .select(["id", "ended_at"])
        .where("id", "=", callId)
        .executeTakeFirst();
      if (!call) throw notFound("Appel introuvable");

      const participant = await db
        .selectFrom("call_participants")
        .select("user_id")
        .where("call_id", "=", callId)
        .where("user_id", "=", userId)
        .where("left_at", "is", null)
        .executeTakeFirst();
      if (!participant || call.ended_at) throw forbidden("Seul un participant actif de cet appel peut envoyer ses mesures");

      // user_id n'est jamais accepté dans le DTO : le client ne peut pas usurper un autre participant.
      const now = Date.now();
      const values = samples.map((sample) => {
        const observedAt = Date.parse(sample.observedAt);
        const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(sample.observedAt);
        if (!hasTimezone || !Number.isFinite(observedAt) || observedAt > now + 30_000 || observedAt < now - 10 * 60_000) {
          throw new AppError(400, "VALIDATION_FAILED", "Horodatage de mesure invalide ou trop ancien");
        }
        return {
            call_id: callId,
            user_id: userId,
            ts: new Date(observedAt),
            rtt_ms: sample.rttMs,
            jitter_ms: sample.jitterMs,
            packet_loss_pct: sample.packetLossPct,
            bitrate_kbps: sample.bitrateKbps,
            candidate_type: sample.candidateType,
          };
      });
      await db.insertInto("call_quality_samples").values(values).execute();

      reply.code(202);
      return { accepted: samples.length };
    },
  );
}
