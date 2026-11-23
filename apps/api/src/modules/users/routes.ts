import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { Me } from "@chatisen/shared";
import { unauthenticated } from "../../errors";
import { requireAuth } from "../../plugins/authenticate";
import { toMe } from "../auth/routes";

export async function userRoutes(
  app: FastifyInstance,
  opts: { authenticate: preHandlerAsyncHookHandler },
): Promise<void> {
  app.get("/users/me", { preHandler: opts.authenticate, schema: { response: { 200: Me } } }, async (request) => {
    const { userId } = requireAuth(request);
    const user = await app.db.selectFrom("users").selectAll().where("id", "=", userId).executeTakeFirst();
    // Compte supprimé alors que le token est encore valide.
    if (!user) throw unauthenticated();
    return toMe(user);
  });
}
