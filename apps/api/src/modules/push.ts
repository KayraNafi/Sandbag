import { pushTokenSchema, webPushSubscriptionSchema } from '@sandbag/shared';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client';
import { notFound } from '../errors';
import { authSessions, notifications, pushTokens, webPushSubscriptions } from '../db/schema';
import { requireUser, sessionHash } from './auth';

const BATCH = 100;
// News that's an hour late is worse than none, like after the worker has been down.
const MAX_AGE_MS = 3_600_000;

export interface PushMessage {
  title: string;
  body: string;
  route: string | null;
}

export interface Sender<Target> {
  /** dead: targets that will never work again. retry: nothing got through, but it might later. */
  send(targets: Target[], message: PushMessage): Promise<{ dead: Target[]; retry: boolean }>;
}

export interface WebPushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Firebase for the Android app, and the browsers' own push services for the web app. Either can be off. */
export interface PushSenders {
  fcm?: Sender<string>;
  web?: Sender<WebPushTarget>;
}

const live = (sessionHashColumn: typeof pushTokens.sessionHash | typeof webPushSubscriptions.sessionHash) =>
  and(eq(authSessions.tokenHash, sessionHashColumn), gt(authSessions.expiresAt, new Date()));

/** Tries each way of reaching the user. Asks for a retry only if every way that was tried asked for one. */
async function deliverOne(db: Db, senders: PushSenders, userId: string, message: PushMessage): Promise<'sent' | 'none' | 'retry'> {
  const outcomes: boolean[] = [];
  if (senders.fcm) {
    const rows = await db.select({ token: pushTokens.token }).from(pushTokens)
      .innerJoin(authSessions, live(pushTokens.sessionHash))
      .where(eq(pushTokens.userId, userId));
    if (rows.length) {
      const { dead, retry } = await senders.fcm.send(rows.map((row) => row.token), message);
      if (dead.length) await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
      outcomes.push(retry);
    }
  }
  if (senders.web) {
    const rows = await db.select({ endpoint: webPushSubscriptions.endpoint, p256dh: webPushSubscriptions.p256dh, auth: webPushSubscriptions.auth })
      .from(webPushSubscriptions)
      .innerJoin(authSessions, live(webPushSubscriptions.sessionHash))
      .where(eq(webPushSubscriptions.userId, userId));
    if (rows.length) {
      const { dead, retry } = await senders.web.send(rows, message);
      if (dead.length) await db.delete(webPushSubscriptions).where(inArray(webPushSubscriptions.endpoint, dead.map((item) => item.endpoint)));
      outcomes.push(retry);
    }
  }
  if (!outcomes.length) return 'none';
  return outcomes.every(Boolean) ? 'retry' : 'sent';
}

/**
 * Sends what notify() wrote. Reading it back from the table means a rolled-back
 * transaction never pushes, and a restart loses nothing. Returns how many went out.
 */
export async function deliverPending(db: Db, senders: PushSenders): Promise<number> {
  const pending = await db.select().from(notifications)
    .where(isNull(notifications.pushedAt))
    .orderBy(asc(notifications.createdAt))
    .limit(BATCH);
  let sent = 0;
  for (const row of pending) {
    if (row.createdAt.getTime() >= Date.now() - MAX_AGE_MS) {
      const outcome = await deliverOne(db, senders, row.userId, { title: row.title, body: row.body, route: row.route });
      if (outcome === 'retry') continue;
      if (outcome === 'sent') sent += 1;
    }
    await db.update(notifications).set({ pushedAt: new Date() }).where(eq(notifications.id, row.id));
  }
  return sent;
}

/** webPushPublicKey: what browsers encrypt to. Without it the web app doesn't offer notifications. */
export function pushRoutes(app: FastifyInstance, db: Db, webPushPublicKey?: string): void {
  // A phone that changes hands moves its token to whoever signed in last.
  app.put('/me/push-token', async (request, reply) => {
    const user = await requireUser(db, request);
    const { token } = pushTokenSchema.parse(request.body);
    const owner = { sessionHash: sessionHash(request), userId: user.id };
    await db.insert(pushTokens).values({ token, ...owner }).onConflictDoUpdate({ target: pushTokens.token, set: owner });
    reply.code(204);
  });

  app.get('/push/web-key', async (request) => {
    await requireUser(db, request);
    if (!webPushPublicKey) throw notFound('Web notifications aren’t set up on this server');
    return { key: webPushPublicKey };
  });

  // Same rule for a browser: the latest sign-in owns it.
  app.put('/me/web-push', async (request, reply) => {
    const user = await requireUser(db, request);
    const { endpoint, keys } = webPushSubscriptionSchema.parse(request.body);
    const row = { p256dh: keys.p256dh, auth: keys.auth, sessionHash: sessionHash(request), userId: user.id };
    await db.insert(webPushSubscriptions).values({ endpoint, ...row }).onConflictDoUpdate({ target: webPushSubscriptions.endpoint, set: row });
    reply.code(204);
  });
}
