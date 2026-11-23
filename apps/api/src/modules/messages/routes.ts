import type { FastifyInstance, onRequestAsyncHookHandler } from "fastify";
import { ConversationParams, MessageHistory, MessageHistoryQuery } from "@chatisen/shared";
import { requireAuth } from "../../plugins/authenticate";
import { requireMember } from "../conversations/service";
import { messageHistory } from "./service";

/** GET /api/v1/conversations/:id/messages : historique paginé, réservé aux membres (FR-03, FR-08). */
export async function messageRoutes(
  app: FastifyInstance,
  opts: { authenticate: onRequestAsyncHookHandler },
): Promise<void> {
  app.get(
    "/conversations/:id/messages",
    {
      onRequest: opts.authenticate,
      schema: { params: ConversationParams, querystring: MessageHistoryQuery, response: { 200: MessageHistory } },
    },
    async (request) => {
      const { userId } = requireAuth(request);
      const { id } = request.params as ConversationParams;
      const { before, limit } = request.query as MessageHistoryQuery;
      await requireMember(app.db, id, userId);
      return messageHistory(app.db, id, before, limit ?? 50);
    },
  );
}
