import type { NotificationKind, NotificationView } from '@sandbag/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, DbOrTx } from '../db/client';
import { notifications } from '../db/schema';
import { requireUser } from './auth';
import { awardTrophies } from './trophies';

export async function notify(db: DbOrTx, userId: string, message: { kind: NotificationKind; title: string; body: string; route: string | null }): Promise<void> {
  await db.insert(notifications).values({ userId, ...message });
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
