import type { NotificationKind, NotificationView } from '@sandbag/shared';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, DbOrTx } from '../db/client';
import { notifications } from '../db/schema';
import { requireUser } from './auth';
import { awardTrophies } from './trophies';

export async function notify(db: DbOrTx, userId: string, message: { kind: NotificationKind; title: string; body: string; route: string | null }): Promise<void> {
  await db.insert(notifications).values({ userId, ...message });
}

/** How long the same reaction to the same thing stays one piece of news, so tapping it on and off can't be a flood. */
const REACTION_QUIET_MS = 60 * 60 * 1000;

/** Tells someone a person reacted to what they wrote, unless that's themselves or they were told just now. */
export async function notifyReaction(
  db: DbOrTx,
  to: { id: string },
  by: { id: string; displayName: string },
  emoji: string,
  about: { body: string; route: string },
): Promise<void> {
  if (to.id === by.id) return;
  const title = `${by.displayName} reacted ${emoji}`;
  const [recent] = await db.select({ id: notifications.id }).from(notifications).where(and(
    eq(notifications.userId, to.id), eq(notifications.kind, 'reaction'), eq(notifications.route, about.route),
    eq(notifications.title, title), eq(notifications.body, about.body),
    gt(notifications.createdAt, new Date(Date.now() - REACTION_QUIET_MS)),
  )).limit(1);
  if (!recent) await notify(db, to.id, { kind: 'reaction', title, body: about.body, route: about.route });
}

export function notificationRoutes(app: FastifyInstance, db: Db): void {
  app.get('/notifications', async (request): Promise<NotificationView[]> => {
    const user = await requireUser(db, request);
    // Catches what someone else's action earned you: a recruit, or a call you won.
    await awardTrophies(db, user);
    const rows = await db.select().from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return rows.map((row) => ({
      id: row.id, kind: row.kind, title: row.title, body: row.body, route: row.route, read: row.readAt !== null, createdAt: row.createdAt.toISOString(),
    }));
  });

  app.post('/notifications/read', async (request, reply) => {
    const user = await requireUser(db, request);
    await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    reply.code(204);
  });
}
