import { pushTokenSchema } from '@sandbag/shared';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client';
import { authSessions, notifications, pushTokens } from '../db/schema';
import { requireUser, sessionHash } from './auth';

const BATCH = 100;
// News that's an hour late is worse than none, like after the worker has been down.
const MAX_AGE_MS = 3_600_000;

export interface PushMessage {
  title: string;
  body: string;
  route: string | null;
}

export interface PushSender {
  /** dead: tokens that will never work again. retry: nothing got through, but it might later. */
  send(tokens: string[], message: PushMessage): Promise<{ dead: string[]; retry: boolean }>;
}

/**
 * Sends what notify() wrote. Reading it back from the table means a rolled-back
 * transaction never pushes, and a restart loses nothing. Returns how many went out.
 */
export async function deliverPending(db: Db, sender: PushSender): Promise<number> {
  const pending = await db.select().from(notifications)
    .where(isNull(notifications.pushedAt))
    .orderBy(asc(notifications.createdAt))
    .limit(BATCH);
  let sent = 0;
  for (const row of pending) {
    if (row.createdAt.getTime() >= Date.now() - MAX_AGE_MS) {
      const rows = await db.select({ token: pushTokens.token }).from(pushTokens)
        .innerJoin(authSessions, eq(authSessions.tokenHash, pushTokens.sessionHash))
        .where(and(eq(pushTokens.userId, row.userId), gt(authSessions.expiresAt, new Date())));
      if (rows.length) {
        const { dead, retry } = await sender.send(rows.map((item) => item.token), { title: row.title, body: row.body, route: row.route });
        if (dead.length) await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
        if (retry) continue;
        sent += 1;
      }
    }
    await db.update(notifications).set({ pushedAt: new Date() }).where(eq(notifications.id, row.id));
  }
  return sent;
}

export function pushRoutes(app: FastifyInstance, db: Db): void {
  // A phone that changes hands moves its token to whoever signed in last.
  app.put('/me/push-token', async (request, reply) => {
    const user = await requireUser(db, request);
    const { token } = pushTokenSchema.parse(request.body);
    const owner = { sessionHash: sessionHash(request), userId: user.id };
    await db.insert(pushTokens).values({ token, ...owner }).onConflictDoUpdate({ target: pushTokens.token, set: owner });
    reply.code(204);
  });
}
