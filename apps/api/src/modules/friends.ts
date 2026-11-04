import { addFriendSchema, DAY_MS, nextInviteGoal, voice, type InviteSummary, type PublicUser } from '@sandbag/shared';
import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, DbOrTx } from '../db/client';
import { friendships, nudges, users } from '../db/schema';
import { badRequest, conflict, notFound } from '../errors';
import { newInviteCode, requireUser, toPublic } from './auth';
import { notify } from './notifications';

const UUID = /^[0-9a-f-]{36}$/i;
const ordered = (a: string, b: string) => (a < b ? { userA: a, userB: b } : { userA: b, userB: a });

export async function befriend(db: DbOrTx, a: string, b: string): Promise<void> {
  await db.insert(friendships).values(ordered(a, b)).onConflictDoNothing();
}

export async function friendIds(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db.select().from(friendships).where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)));
  return rows.map((row) => (row.userA === userId ? row.userB : row.userA));
}

export async function areFriends(db: DbOrTx, a: string, b: string): Promise<boolean> {
  const pair = ordered(a, b);
  const [row] = await db.select({ userA: friendships.userA }).from(friendships)
    .where(and(eq(friendships.userA, pair.userA), eq(friendships.userB, pair.userB)));
  return Boolean(row);
}

export function friendRoutes(app: FastifyInstance, db: Db): void {
  app.get('/friends', async (request): Promise<PublicUser[]> => {
    const user = await requireUser(db, request);
    const ids = await friendIds(db, user.id);
    if (!ids.length) return [];
    const rows = await db.select().from(users).where(inArray(users.id, ids));
    return rows.map(toPublic);
  });

  // Adding an existing user is not a recruit, so it doesn't raise the invite count.
  // Knowing a code gets you into someone's crew, so guessing them is limited like a password.
  app.post('/friends', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request): Promise<PublicUser> => {
    const user = await requireUser(db, request);
    const { inviteCode } = addFriendSchema.parse(request.body);
    const [friend] = await db.select().from(users).where(eq(users.inviteCode, inviteCode.toUpperCase()));
    if (!friend) throw notFound('That invite code isn’t valid');
    if (friend.id === user.id) throw badRequest('That’s your own code. Nice try.');
    await befriend(db, user.id, friend.id);
    return toPublic(friend);
  });

  app.delete<{ Params: { id: string } }>('/friends/:id', async (request, reply) => {
    const user = await requireUser(db, request);
    if (!UUID.test(request.params.id)) throw notFound();
    const pair = ordered(user.id, request.params.id);
    await db.delete(friendships).where(and(eq(friendships.userA, pair.userA), eq(friendships.userB, pair.userB)));
    reply.code(204);
  });

  // A nudge is a joke, and it stops being one the second time, so it's once a day per friend.
  app.post<{ Params: { id: string } }>('/friends/:id/nudge', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await requireUser(db, request);
    const friendId = request.params.id;
    if (!UUID.test(friendId) || !(await areFriends(db, user.id, friendId))) throw notFound();
    // One statement, so two taps at once can't both get through.
    const [sent] = await db.insert(nudges).values({ senderId: user.id, receiverId: friendId })
      .onConflictDoUpdate({ target: [nudges.senderId, nudges.receiverId], set: { sentAt: sql`now()` }, setWhere: lt(nudges.sentAt, new Date(Date.now() - DAY_MS)) })
      .returning({ at: nudges.sentAt });
    if (!sent) throw conflict('You already nudged them today. Let them live.');
    await notify(db, friendId, { kind: 'nudge', title: 'Nudge', body: voice.nudged(user.displayName, sent.at.getTime()), route: 'train' });
    reply.code(204);
  });

  // For a code that got out. The old one stops working, and nobody already in your crew is removed.
  app.post('/invites/rotate', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const user = await requireUser(db, request);
    const code = newInviteCode();
    await db.update(users).set({ inviteCode: code }).where(eq(users.id, user.id));
    return { code };
  });

  app.get('/invites', async (request): Promise<InviteSummary> => {
    const user = await requireUser(db, request);
    const crew = [user.id, ...(await friendIds(db, user.id))];
    const counts = await db
      .select({ inviter: users.invitedBy, joined: sql<number>`count(*)::int` })
      .from(users)
      .where(inArray(users.invitedBy, crew))
      .groupBy(users.invitedBy);
    const people = await db.select().from(users).where(inArray(users.id, crew));
    const joinedBy = new Map(counts.map((row) => [row.inviter, row.joined]));
    const joined = joinedBy.get(user.id) ?? 0;
    return {
      code: user.inviteCode,
      joined,
      nextGoal: nextInviteGoal(joined),
      recruiters: people
        .map((person) => ({ user: toPublic(person), joined: joinedBy.get(person.id) ?? 0 }))
        .sort((a, b) => b.joined - a.joined),
    };
  });
}
