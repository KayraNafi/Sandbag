import {
  CALL_DAYS, CALL_POINTS, CALLABLE_DAYS, bestSet, createCallSchema, createPostSchema, createReplySchema, DAY_MS, exerciseKey, LIVE_CALLS, MAX_OPEN_CALLS, newPbOf,
  runHeadline, voice, type CallView, type CreatePost, type Entry, type PostView, type ReplyView, type SavedWorkout,
} from '@sandbag/shared';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import type { Db, DbOrTx } from '../db/client';
import { postReplies, postRespects, posts, postSaves, runs, sandbagCalls, savedWorkouts, syncSeq, users } from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { requireUser, toPublic } from './auth';
import { expireCalls } from './calls';
import { friendIds } from './friends';
import { notify } from './notifications';

const FEED_PAGE = 30;
// Each of these notifies someone, so a friend can't turn them into a flood.
const WRITE_LIMIT = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
const UUID = /^[0-9a-f-]{36}$/i;

type Post = typeof posts.$inferSelect;
type PostContent = Pick<typeof posts.$inferInsert, 'kind' | 'title' | 'showWeights' | 'entries' | 'run'>;

/**
 * What a post holds. A run is copied from what was synced, never taken from the request, so what the crew
 * sees is what was logged, and the PB mark is worked out here against every other run of yours.
 */
async function contentOf(db: DbOrTx, userId: string, input: CreatePost): Promise<PostContent> {
  if (input.kind !== 'run') return { kind: input.kind, title: input.title, showWeights: input.showWeights, entries: input.entries, run: null };
  const own = await db.select().from(runs).where(and(eq(runs.ownerId, userId), eq(runs.deleted, false)));
  const run = own.find((item) => item.id === input.runId);
  if (!run) throw badRequest('That run isn’t synced yet, or it’s been deleted');
  const pb = newPbOf(run, own.filter((item) => item.id !== run.id));
  return {
    kind: 'run',
    title: runHeadline(run),
    // Nothing on a run is hidden.
    showWeights: true,
    entries: [],
    run: { date: run.date, activity: run.activity, distanceKm: run.distanceKm, seconds: run.seconds, newPb: pb?.name ?? null },
  };
}

/** Weights are removed here, on the server, so "hide my weights" can't leak. */
function visibleEntries(post: Post, viewerId: string): Entry[] {
  if (post.showWeights || post.authorId === viewerId) return post.entries;
  return post.entries.map(({ includesEquipment: _hidden, ...entry }) => ({ ...entry, weight: null, note: '' }));
}

function canSee(post: Post, viewerId: string, friends: string[]): boolean {
  if (post.authorId === viewerId) return true;
  if (!friends.includes(post.authorId)) return false;
  return !post.recipientIds?.length || post.recipientIds.includes(viewerId);
}

async function loadVisiblePost(db: DbOrTx, postId: string, viewerId: string): Promise<Post> {
  if (!UUID.test(postId)) throw notFound();
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  // Same answer as a missing post, so ids can't be probed.
  if (!post || !canSee(post, viewerId, await friendIds(db, viewerId))) throw notFound();
  return post;
}

/** Calls as the viewer may see them: the number stays hidden if the post hid it, except from the one called. */
async function callViews(db: DbOrTx, where: SQL | undefined, viewerId: string, limit: number): Promise<CallView[]> {
  const caller = alias(users, 'caller');
  const target = alias(users, 'target');
  const rows = await db.select({ call: sandbagCalls, caller, target }).from(sandbagCalls)
    .innerJoin(caller, eq(caller.id, sandbagCalls.callerId))
    .innerJoin(target, eq(target.id, sandbagCalls.targetId))
    .where(where)
    .orderBy(desc(sandbagCalls.createdAt))
    .limit(limit);
  return rows.map((row) => {
    const side = row.call.callerId === viewerId ? 'caller' : row.call.targetId === viewerId ? 'target' : null;
    return {
      id: row.call.id,
      caller: toPublic(row.caller),
      target: toPublic(row.target),
      exercise: row.call.exercise,
      targetWeight: row.call.weightsHidden && row.call.targetId !== viewerId ? null : row.call.targetWeight,
      targetReps: row.call.targetReps,
      line: row.call.line,
      status: row.call.status,
      deadlineAt: LIVE_CALLS.includes(row.call.status) ? row.call.deadlineAt.toISOString() : null,
      points: side ? CALL_POINTS[row.call.status][side] : 0,
      createdAt: row.call.createdAt.toISOString(),
    };
  });
}

async function toViews(db: DbOrTx, rows: Post[], viewerId: string): Promise<PostView[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const countBy = async (table: typeof postRespects | typeof postSaves) => {
    const counts = await db.select({ postId: table.postId, total: sql<number>`count(*)::int` }).from(table).where(inArray(table.postId, ids)).groupBy(table.postId);
    return new Map(counts.map((row) => [row.postId, row.total]));
  };
  const respects = await countBy(postRespects);
  const saves = await countBy(postSaves);
  const replyCounts = await db.select({ postId: postReplies.postId, total: sql<number>`count(*)::int` }).from(postReplies).where(inArray(postReplies.postId, ids)).groupBy(postReplies.postId);
  const callCounts = await db.select({
    postId: sandbagCalls.postId,
    total: sql<number>`count(*)::int`,
    live: sql<number>`(count(*) filter (where ${inArray(sandbagCalls.status, LIVE_CALLS)}))::int`,
  }).from(sandbagCalls).where(inArray(sandbagCalls.postId, ids)).groupBy(sandbagCalls.postId);
  const mine = await db.select({ postId: postRespects.postId }).from(postRespects).where(and(inArray(postRespects.postId, ids), eq(postRespects.userId, viewerId)));
  const mySaves = await db.select({ postId: postSaves.postId }).from(postSaves).where(and(inArray(postSaves.postId, ids), eq(postSaves.userId, viewerId)));
  const authors = await db.select().from(users).where(inArray(users.id, rows.map((row) => row.authorId)));
  const authorById = new Map(authors.map((author) => [author.id, author]));
  const replyMap = new Map(replyCounts.map((row) => [row.postId, row.total]));
  const callMap = new Map(callCounts.map((row) => [row.postId, row]));
  const mineSet = new Set(mine.map((row) => row.postId));
  const mySaveSet = new Set(mySaves.map((row) => row.postId));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    author: toPublic(authorById.get(row.authorId)!),
    title: row.title,
    caption: row.caption,
    showWeights: row.showWeights,
    entries: visibleEntries(row, viewerId),
    run: row.run,
    createdAt: row.createdAt.toISOString(),
    respects: respects.get(row.id) ?? 0,
    respectedByMe: mineSet.has(row.id),
    replyCount: replyMap.get(row.id) ?? 0,
    callCount: callMap.get(row.id)?.total ?? 0,
    liveCalls: callMap.get(row.id)?.live ?? 0,
    saveCount: saves.get(row.id) ?? 0,
    savedByMe: mySaveSet.has(row.id),
  }));
}

export function feedRoutes(app: FastifyInstance, db: Db): void {
  app.get<{ Querystring: { before?: string } }>('/feed', async (request): Promise<PostView[]> => {
    const user = await requireUser(db, request);
    // So a call that ran out doesn't keep its post marked.
    await expireCalls(db);
    const friends = await friendIds(db, user.id);
    const before = request.query.before ? new Date(request.query.before) : null;
    if (before && Number.isNaN(before.getTime())) throw badRequest('Bad date');
    const rows = await db.select().from(posts)
      .where(and(
        inArray(posts.authorId, [user.id, ...friends]),
        or(
          eq(posts.authorId, user.id),
          sql`${posts.recipientIds} is null`,
          sql`${user.id}::uuid = any(${posts.recipientIds})`,
        ),
        before ? lt(posts.createdAt, before) : undefined,
      ))
      .orderBy(desc(posts.createdAt))
      .limit(FEED_PAGE);
    return toViews(db, rows, user.id);
  });

  app.post('/posts', WRITE_LIMIT, async (request, reply): Promise<PostView> => {
    const user = await requireUser(db, request);
    const input = createPostSchema.parse(request.body);
    const friends = await friendIds(db, user.id);
    if (input.recipientIds.some((id) => !friends.includes(id))) throw badRequest('You can only share with your crew');
    const [post] = await db.insert(posts).values({
      id: input.id,
      authorId: user.id,
      ...(await contentOf(db, user.id, input)),
      caption: input.caption,
      recipientIds: input.recipientIds.length ? input.recipientIds : null,
    }).onConflictDoNothing({ target: posts.id }).returning();
    if (post) reply.code(201);
    const [existing] = post ? [post] : await db.select().from(posts).where(and(eq(posts.id, input.id), eq(posts.authorId, user.id)));
    if (!existing) throw conflict('That post id is taken');
    const [view] = await toViews(db, [existing], user.id);
    return view!;
  });

  app.get<{ Params: { id: string } }>('/posts/:id', async (request): Promise<PostView & { replies: ReplyView[]; calls: CallView[] }> => {
    const user = await requireUser(db, request);
    const post = await loadVisiblePost(db, request.params.id, user.id);
    await expireCalls(db);
    const [view] = await toViews(db, [post], user.id);
    // Anyone who can see the post sees its calls, the same as its replies.
    const calls = await callViews(db, eq(sandbagCalls.postId, post.id), user.id, 50);
    const rows = await db.select({ reply: postReplies, author: users }).from(postReplies)
      .innerJoin(users, eq(users.id, postReplies.authorId))
      .where(eq(postReplies.postId, post.id))
      .orderBy(postReplies.createdAt);
    return {
      ...view!,
      calls,
      replies: rows.map(({ reply, author }) => ({ id: reply.id, author: toPublic(author), text: reply.text, createdAt: reply.createdAt.toISOString() })),
    };
  });

  app.delete<{ Params: { id: string } }>('/posts/:id', async (request, reply) => {
    const user = await requireUser(db, request);
    const post = await loadVisiblePost(db, request.params.id, user.id);
    if (post.authorId !== user.id) throw forbidden();
    await db.delete(posts).where(eq(posts.id, post.id));
    reply.code(204);
  });

  app.put<{ Params: { id: string } }>('/posts/:id/respect', async (request, reply) => {
    const user = await requireUser(db, request);
    const post = await loadVisiblePost(db, request.params.id, user.id);
    await db.insert(postRespects).values({ postId: post.id, userId: user.id }).onConflictDoNothing();
    reply.code(204);
  });

  app.delete<{ Params: { id: string } }>('/posts/:id/respect', async (request, reply) => {
    const user = await requireUser(db, request);
    if (!UUID.test(request.params.id)) throw notFound();
    await db.delete(postRespects).where(and(eq(postRespects.postId, request.params.id), eq(postRespects.userId, user.id)));
    reply.code(204);
  });

  app.post<{ Params: { id: string } }>('/posts/:id/replies', WRITE_LIMIT, async (request, reply) => {
    const user = await requireUser(db, request);
    const post = await loadVisiblePost(db, request.params.id, user.id);
    const { text } = createReplySchema.parse(request.body);
    await db.transaction(async (tx) => {
      await tx.insert(postReplies).values({ postId: post.id, authorId: user.id, text });
      if (post.authorId !== user.id) {
        await notify(tx, post.authorId, { kind: 'reply', title: `${user.displayName} replied`, body: text, route: `post/${post.id}` });
      }
    });
    reply.code(201);
    return {};
  });

  // Saves a friend's shared workout into your own, with no weights: their numbers
  // came from their machines, so yours load from your own history.
  app.post<{ Params: { id: string } }>('/posts/:id/save', WRITE_LIMIT, async (request): Promise<SavedWorkout> => {
    const user = await requireUser(db, request);
    const post = await loadVisiblePost(db, request.params.id, user.id);
    if (post.kind !== 'share') throw badRequest('Only shared workouts can be saved');
    if (post.authorId === user.id) throw badRequest('That’s already yours');
    return db.transaction(async (tx) => {
      const [fresh] = await tx.insert(postSaves).values({ postId: post.id, userId: user.id }).onConflictDoNothing().returning();
      if (!fresh) throw conflict('You’ve already saved this one');
      const [author] = await tx.select().from(users).where(eq(users.id, post.authorId));
      const [{ position } = { position: 0 }] = await tx
        .select({ position: sql<number>`coalesce(max(${savedWorkouts.position}) + 1, 0)::int` })
        .from(savedWorkouts)
        .where(eq(savedWorkouts.ownerId, user.id));
      const doc: SavedWorkout = {
        id: randomUUID(),
        name: post.title.slice(0, 40),
        position,
        exercises: post.entries.map((entry) => ({ name: entry.name, kind: entry.kind, sets: entry.sets, reps: entry.reps })),
        savedFrom: author?.displayName ?? null,
        updatedAt: Date.now(),
        deleted: false,
      };
      await tx.insert(savedWorkouts).values({ ...doc, ownerId: user.id, seq: sql<number>`nextval(${syncSeq.seqName})` });
      await notify(tx, post.authorId, { kind: 'saved', title: 'Workout saved', body: voice.workoutSaved(user.displayName, post.title), route: `post/${post.id}` });
      return doc;
    });
  });

  app.post<{ Params: { id: string } }>('/posts/:id/calls', WRITE_LIMIT, async (request, reply) => {
    const user = await requireUser(db, request);
    const post = await loadVisiblePost(db, request.params.id, user.id);
    if (post.authorId === user.id) throw badRequest('Calling yourself out is just therapy');
    if (Date.now() - post.createdAt.getTime() > CALLABLE_DAYS * DAY_MS) throw badRequest('That workout’s too old to call. Catch them on a fresh one.');
    const input = createCallSchema.parse(request.body);
    const key = exerciseKey(input.exercise);
    // The best of that lift in the post, so a lighter warm-up entry can't be the one to beat.
    const [{ entry, best } = {}] = post.entries
      .flatMap((item) => {
        const set = exerciseKey(item.name) === key ? bestSet(item) : null;
        return set ? [{ entry: item, best: set }] : [];
      })
      .sort((a, b) => b.best.max - a.best.max);
    if (!entry || !best) throw badRequest('That lift isn’t in this workout');

    await expireCalls(db);
    const [{ out } = { out: 0 }] = await db.select({ out: sql<number>`count(*)::int` }).from(sandbagCalls)
      .where(and(eq(sandbagCalls.callerId, user.id), eq(sandbagCalls.status, 'open')));
    if (out >= MAX_OPEN_CALLS) throw conflict(`You’ve got ${MAX_OPEN_CALLS} calls out already. Let one land first.`);
    const [taken] = await db.select({ id: sandbagCalls.id }).from(sandbagCalls).where(and(
      eq(sandbagCalls.exerciseKey, key),
      // One live call per lift, so nobody gets piled on, and one call per lift per post, ever.
      or(and(eq(sandbagCalls.targetId, post.authorId), inArray(sandbagCalls.status, LIVE_CALLS)), eq(sandbagCalls.postId, post.id)),
    )).limit(1);
    if (taken) throw conflict('Someone already called this lift. Wait for the verdict.');

    const now = Date.now();
    const [call] = await db.insert(sandbagCalls).values({
      callerId: user.id,
      targetId: post.authorId,
      postId: post.id,
      exercise: entry.name,
      exerciseKey: key,
      // The weight and reps of one real set, so the target is a set they actually did.
      targetWeight: best.weight,
      targetReps: best.reps,
      targetMax: best.max,
      weightsHidden: !post.showWeights,
      line: input.line,
      createdAt: new Date(now),
      deadlineAt: new Date(now + CALL_DAYS * DAY_MS),
    }).returning({ id: sandbagCalls.id });
    await notify(db, post.authorId, { kind: 'call', title: `${user.displayName} called sandbag`, body: `On your ${entry.name}. “${input.line}”`, route: 'train' });
    reply.code(201);
    // An insert without a conflict clause always returns its row.
    return { id: call!.id };
  });

  app.get('/calls', async (request): Promise<CallView[]> => {
    const user = await requireUser(db, request);
    await expireCalls(db);
    return callViews(db, or(eq(sandbagCalls.targetId, user.id), eq(sandbagCalls.callerId, user.id)), user.id, 50);
  });
}
