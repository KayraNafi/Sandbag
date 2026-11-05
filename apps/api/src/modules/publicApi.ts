import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { verify } from '@node-rs/argon2';
import {
  apiSavedWorkoutSchema, apiWorkoutsSchema, createApiKeySchema, tidySets,
  type ApiKeyView, type LoggedWorkout, type SavedWorkout,
} from '@sandbag/shared';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { lockUser, type Db, type Tx } from '../db/client';
import { apiKeys, loggedWorkouts, savedWorkouts, users } from '../db/schema';
import { badRequest, HttpError, notFound, unauthorized } from '../errors';
import { requireUser } from './auth';
import { notifyOvertaken, weekScores } from './rankings';
import { awardTrophies } from './trophies';
import { saveLogged, saveSaved, toLogged, toSaved } from './workouts';

const KEY_PREFIX = 'sbk_';
const MAX_KEYS = 10;
const PAGE_DEFAULT = 100;
const PAGE_MAX = 500;

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** Keys only ever open /v1, which can't touch your password, account or friends. */
async function requireKey(db: Db, request: FastifyRequest): Promise<typeof users.$inferSelect> {
  const header = request.headers.authorization;
  if (!header?.startsWith(`Bearer ${KEY_PREFIX}`)) throw unauthorized();
  const [row] = await db.select({ user: users, keyId: apiKeys.id }).from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(eq(apiKeys.tokenHash, hashKey(header.slice(7))));
  if (!row) throw unauthorized();
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.keyId));
  return row.user;
}

function toKeyView(row: typeof apiKeys.$inferSelect): ApiKeyView {
  return { id: row.id, name: row.name, prefix: row.prefix, createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null };
}

export function apiKeyRoutes(app: FastifyInstance, db: Db): void {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/me/api-keys', async (request): Promise<ApiKeyView[]> => {
    const user = await requireUser(db, request);
    return (await db.select().from(apiKeys).where(eq(apiKeys.userId, user.id)).orderBy(desc(apiKeys.createdAt))).map(toKeyView);
  });

  // Asks for the password again: a key outlives the session that made it.
  app.post('/me/api-keys', strict, async (request, reply): Promise<ApiKeyView & { key: string }> => {
    const user = await requireUser(db, request);
    const input = createApiKeySchema.parse(request.body);
    if (!(await verify(user.passwordHash, input.password))) throw new HttpError(400, 'That isn’t your password');
    const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
    // Held across the count and the insert, or requests at the same moment all pass the cap.
    const row = await db.transaction(async (tx) => {
      await lockUser(tx, user.id);
      const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(apiKeys).where(eq(apiKeys.userId, user.id));
      if (total >= MAX_KEYS) throw badRequest(`You have ${MAX_KEYS} keys. Delete one first.`);
      const [created] = await tx.insert(apiKeys).values({ userId: user.id, name: input.name, prefix: key.slice(0, 12), tokenHash: hashKey(key) }).returning();
      return created!;
    });
    reply.code(201);
    return { ...toKeyView(row), key };
  });

  app.delete<{ Params: { id: string } }>('/me/api-keys/:id', async (request, reply) => {
    const user = await requireUser(db, request);
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) throw notFound();
    await db.delete(apiKeys).where(and(eq(apiKeys.id, request.params.id), eq(apiKeys.userId, user.id)));
    reply.code(204);
  });
}

function assertNotFuture(date: string): void {
  // A day ahead is someone in a later time zone. More than that is a typo or a cheat.
  if (Date.parse(`${date}T00:00:00Z`) > Date.now() + 2 * 86_400_000) throw badRequest(`${date} is in the future`);
}

export function publicApiRoutes(app: FastifyInstance, db: Db): void {
  const large = { bodyLimit: 8 * 1024 * 1024, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  app.get('/v1/me', async (request) => {
    const user = await requireKey(db, request);
    return { id: user.id, username: user.username, displayName: user.displayName, weeklyTarget: user.weeklyTarget };
  });

  app.get<{ Querystring: { after?: string; limit?: string } }>('/v1/workouts', async (request) => {
    const user = await requireKey(db, request);
    const after = Number(request.query.after ?? 0);
    const limit = Math.min(Number(request.query.limit ?? PAGE_DEFAULT), PAGE_MAX);
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1) throw badRequest('after and limit must be whole numbers');
    const rows = await db.select().from(loggedWorkouts)
      .where(and(eq(loggedWorkouts.ownerId, user.id), eq(loggedWorkouts.deleted, false), gt(loggedWorkouts.seq, after)))
      .orderBy(asc(loggedWorkouts.seq))
      .limit(limit);
    return { workouts: rows.map(toLogged), nextCursor: rows.length === limit ? rows.at(-1)!.seq : null };
  });

  // Sending the same id again replaces that workout, so a failed import is safe to rerun.
  app.post('/v1/workouts', large, async (request, reply) => {
    const user = await requireKey(db, request);
    const { workouts } = apiWorkoutsSchema.parse(request.body);
    workouts.forEach((workout) => assertNotFuture(workout.date));
    const docs: LoggedWorkout[] = workouts.map((workout) => ({
      ...workout,
      id: workout.id ?? randomUUID(),
      entries: workout.entries.map((entry) => tidySets({ ...entry, id: entry.id ?? randomUUID() })),
      updatedAt: 0,
      deleted: false,
    }));
    if (new Set(docs.map((doc) => doc.id)).size !== docs.length) throw badRequest('Each workout in a batch needs its own id');

    const created = await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      await lockUser(tx, user.id);
      const existing = await tx.select({ id: loggedWorkouts.id, updatedAt: loggedWorkouts.updatedAt }).from(loggedWorkouts)
        .where(and(eq(loggedWorkouts.ownerId, user.id), inArray(loggedWorkouts.id, docs.map((doc) => doc.id))));
      const stamps = new Map(existing.map((row) => [row.id, row.updatedAt]));
      // Always newer than what's stored, even if a phone's clock ran ahead.
      for (const doc of docs) doc.updatedAt = Math.max(Date.now(), (stamps.get(doc.id) ?? 0) + 1);
      const before = await weekScores(tx, user.id);
      await saveLogged(tx, user, docs);
      await notifyOvertaken(tx, user, before);
      await awardTrophies(tx, user);
      return docs.length - existing.length;
    });
    reply.code(201);
    return { created, updated: docs.length - created, ids: docs.map((doc) => doc.id) };
  });

  app.delete<{ Params: { id: string } }>('/v1/workouts/:id', async (request, reply) => {
    const user = await requireKey(db, request);
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      await lockUser(tx, user.id);
      const [row] = await tx.select().from(loggedWorkouts).where(and(eq(loggedWorkouts.ownerId, user.id), eq(loggedWorkouts.id, request.params.id)));
      if (!row || row.deleted) throw notFound();
      await saveLogged(tx, user, [{ ...toLogged(row), deleted: true, updatedAt: Math.max(Date.now(), row.updatedAt + 1) }]);
    });
    reply.code(204);
  });

  app.get('/v1/saved-workouts', async (request) => {
    const user = await requireKey(db, request);
    const rows = await db.select().from(savedWorkouts)
      .where(and(eq(savedWorkouts.ownerId, user.id), eq(savedWorkouts.deleted, false)))
      .orderBy(asc(savedWorkouts.position));
    return { savedWorkouts: rows.map(toSaved) };
  });

  app.post('/v1/saved-workouts', async (request, reply) => {
    const user = await requireKey(db, request);
    const input = apiSavedWorkoutSchema.parse(request.body);
    const doc = await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      await lockUser(tx, user.id);
      const rows = await tx.select().from(savedWorkouts).where(eq(savedWorkouts.ownerId, user.id));
      const current = input.id ? rows.find((row) => row.id === input.id) : undefined;
      const saved: SavedWorkout = {
        id: input.id ?? randomUUID(),
        name: input.name,
        exercises: input.exercises,
        position: current?.position ?? rows.reduce((max, row) => Math.max(max, row.position + 1), 0),
        savedFrom: current?.savedFrom ?? null,
        updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
        deleted: false,
      };
      await saveSaved(tx, user.id, [saved]);
      return saved;
    });
    reply.code(201);
    return doc;
  });

  app.delete<{ Params: { id: string } }>('/v1/saved-workouts/:id', async (request, reply) => {
    const user = await requireKey(db, request);
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      await lockUser(tx, user.id);
      const [row] = await tx.select().from(savedWorkouts).where(and(eq(savedWorkouts.ownerId, user.id), eq(savedWorkouts.id, request.params.id)));
      if (!row || row.deleted) throw notFound();
      await saveSaved(tx, user.id, [{ ...toSaved(row), deleted: true, updatedAt: Math.max(Date.now(), row.updatedAt + 1) }]);
    });
    reply.code(204);
  });
}
