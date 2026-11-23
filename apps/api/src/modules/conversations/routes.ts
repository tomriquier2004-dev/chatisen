import type { FastifyInstance, onRequestAsyncHookHandler } from "fastify";
import {
  AddMemberRequest,
  ConversationList,
  ConversationParams,
  ConversationView,
  CreateConversationRequest,
  MemberParams,
  UserSearchQuery,
  UserSearchResponse,
} from "@chatisen/shared";
import { requireAuth } from "../../plugins/authenticate";
import { RATE_RULES, rateLimit, type RateLimiter } from "../../plugins/rate-limit";
import type { MembershipEvents } from "./events";
import {
  addMember,
  conversationView,
  conversationViews,
  createGroup,
  openPrivateConversation,
  removeMember,
  searchUsers,
} from "./service";

export interface ConversationRoutesOptions {
  authenticate: onRequestAsyncHookHandler;
  events: MembershipEvents;
  limits: { limiter: RateLimiter; enabled: boolean };
}

/** Routes REST des conversations et de leurs membres (architecture § 5.1, FR-03, FR-06, FR-16). */
export async function conversationRoutes(app: FastifyInstance, opts: ConversationRoutesOptions): Promise<void> {
  const { events } = opts;
  const db = app.db;
  // onRequest : l'authentification passe avant la lecture et la validation du corps.
  app.addHook("onRequest", opts.authenticate);

  // Limite par utilisateur : freine le parcours de l'annuaire par requêtes successives (issue #71).
  const limitSearch = rateLimit(opts.limits.limiter, opts.limits.enabled, RATE_RULES.userSearchPerUser);
  app.get("/users", { preHandler: limitSearch, schema: { querystring: UserSearchQuery, response: { 200: UserSearchResponse } } }, async (request) => {
    const { userId } = requireAuth(request);
    return searchUsers(db, (request.query as UserSearchQuery).query, userId);
  });

  app.get("/conversations", { schema: { response: { 200: ConversationList } } }, async (request) => {
    const { userId } = requireAuth(request);
    return conversationViews(db, userId);
  });

  app.get(
    "/conversations/:id",
    { schema: { params: ConversationParams, response: { 200: ConversationView } } },
    async (request) => {
      const { userId } = requireAuth(request);
      return conversationView(db, userId, (request.params as ConversationParams).id);
    },
  );

  app.post(
    "/conversations",
    { schema: { body: CreateConversationRequest, response: { 200: ConversationView, 201: ConversationView } } },
    async (request, reply) => {
      const { userId } = requireAuth(request);
      const body = request.body as CreateConversationRequest;

      if (body.type === "private") {
        const { id, created } = await openPrivateConversation(db, userId, body.userId);
        if (created) {
          await events.memberAdded({ conversationId: id, userId, role: "member", by: userId });
          await events.memberAdded({ conversationId: id, userId: body.userId, role: "member", by: userId });
        }
        reply.code(created ? 201 : 200);
        return conversationView(db, userId, id);
      }

      const id = await createGroup(db, userId, body.title, body.memberIds);
      const view = await conversationView(db, userId, id);
      for (const m of view.members) {
        await events.memberAdded({ conversationId: id, userId: m.user.id, role: m.role, by: userId });
      }
      reply.code(201);
      return view;
    },
  );

  app.post(
    "/conversations/:id/members",
    { schema: { params: ConversationParams, body: AddMemberRequest, response: { 201: ConversationView } } },
    async (request, reply) => {
      const { userId } = requireAuth(request);
      const { id } = request.params as ConversationParams;
      const body = request.body as AddMemberRequest;
      const role = body.role ?? "member";
      await addMember(db, userId, id, body.userId, role);
      // Après le commit : le temps réel fait rejoindre la room au nouveau membre (§ 5.3).
      await events.memberAdded({ conversationId: id, userId: body.userId, role, by: userId });
      reply.code(201);
      return conversationView(db, userId, id);
    },
  );

  app.delete(
    "/conversations/:id/members/:userId",
    { schema: { params: MemberParams } },
    async (request, reply) => {
      const actor = requireAuth(request);
      const { id, userId } = request.params as MemberParams;
      const { reason } = await removeMember(db, actor.userId, id, userId);
      // Après le commit : le temps réel retire le membre de la room immédiatement (§ 5.3).
      await events.memberRemoved({
        conversationId: id,
        userId,
        by: actor.userId,
        reason,
      });
      return reply.code(204).send();
    },
  );
}
