import { PGlite } from '@electric-sql/pglite';
import type { ApiKeyView, AuthResponse, CallView, CrewView, NotificationView, TrophyView, Entry, InviteSummary, LoggedWorkout, PostView, RankingRow, SyncResponse, Me, SignUpCheck } from '@sandbag/shared';
import { dateIn, mondayOf } from '@sandbag/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { deliverPending, type PushMessage } from './modules/push';
import type { Db } from './db/client';
import * as schema from './db/schema';

const BOOTSTRAP = 'founder-invite-code-long-enough';
let app: FastifyInstance;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(async () => {
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
  app = await buildApp(db as unknown as Db, { bootstrapInviteCode: BOOTSTRAP });
});

async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, token?: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await app.inject({
    method, url,
    ...(body === undefined ? {} : { payload: body as object }),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: response.statusCode, body: (response.body ? JSON.parse(response.body) : undefined) as T };
}

async function register(username: string, inviteCode: string): Promise<AuthResponse> {
  const result = await call<AuthResponse>('POST', '/auth/register', undefined, { username, displayName: username, password: 'correct horse battery', inviteCode });
  expect(result.status).toBe(201);
  return result.body;
}

async function crew(): Promise<{ founder: AuthResponse; friend: AuthResponse }> {
  const founder = await register('founder', BOOTSTRAP);
  const friend = await register('friend', founder.user.inviteCode);
  return { founder, friend };
}

const entry = (name: string, weight: number | null, extra: Partial<Entry> = {}): Entry => ({
  id: `${name.replace(/\W/g, '')}-1`, name, kind: 'strength', sets: 3, reps: 8, weight, perSide: false, rpe: 8, minutes: null, note: '', ...extra,
});

const logged = (id: string, entries: Entry[], extra: Partial<LoggedWorkout> = {}): LoggedWorkout => ({
  id, date: new Date().toISOString().slice(0, 10), title: 'Upper', savedWorkoutId: null, entries, updatedAt: Date.now(), deleted: false, ...extra,
});

const sync = (token: string, cursor: number, loggedWorkouts: LoggedWorkout[] = []) =>
  call<SyncResponse>('POST', '/sync', token, { cursor, loggedWorkouts, savedWorkouts: [] });

const post = (token: string, overrides: Record<string, unknown> = {}) =>
  call<PostView>('POST', '/posts', token, { id: randomUUID(), kind: 'workout', title: 'Upper', caption: '', showWeights: true, entries: [entry('Lat pulldown', 86)], recipientIds: [], ...overrides });

describe('registration is invite-only', () => {
  it('rejects a missing or wrong code', async () => {
    const result = await call('POST', '/auth/register', undefined, { username: 'stranger', displayName: 'S', password: 'correct horse battery', inviteCode: 'nope' });
    expect(result.status).toBe(400);
  });

  it('only lets the bootstrap code work once', async () => {
    await register('founder', BOOTSTRAP);
    const second = await call('POST', '/auth/register', undefined, { username: 'second', displayName: 'S', password: 'correct horse battery', inviteCode: BOOTSTRAP });
    expect(second.status).toBe(400);
  });

  it('never returns the password hash', async () => {
    const founder = await register('founder', BOOTSTRAP);
    expect(JSON.stringify(founder)).not.toContain('argon2');
    const me = await call('GET', '/me', founder.token);
    expect(JSON.stringify(me.body)).not.toContain('argon2');
  });
});

describe('auth', () => {
  it('requires a valid token and ends it on logout', async () => {
    const founder = await register('founder', BOOTSTRAP);
    expect((await call('GET', '/me')).status).toBe(401);
    expect((await call('GET', '/me', 'wrong')).status).toBe(401);
    expect((await call('GET', '/me', founder.token)).status).toBe(200);
    await call('POST', '/auth/logout', founder.token);
    expect((await call('GET', '/me', founder.token)).status).toBe(401);
  });

  it('gives the same error for a wrong password and an unknown user', async () => {
    await register('founder', BOOTSTRAP);
    const wrong = await call<{ error: string }>('POST', '/auth/login', undefined, { username: 'founder', password: 'wrong password here' });
    const unknown = await call<{ error: string }>('POST', '/auth/login', undefined, { username: 'nobody', password: 'wrong password here' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });
});

describe('invites', () => {
  it('will not let a joke number answer a call, or be called', async () => {
    const { founder, friend } = await crew();
    const post = await call<{ id: string }>('POST', '/posts', founder.token, { id: randomUUID(), kind: 'workout', title: 'Legs', caption: '', showWeights: true, entries: [entry('Squat', 100)], recipientIds: [] });
    expect((await call('POST', `/posts/${post.body.id}/calls`, friend.token, { exercise: 'Squat', line: 'Sus.' })).status).toBe(201);
    const session = { id: 'joke', date: new Date().toISOString().slice(0, 10), title: 'Legs', savedWorkoutId: null, updatedAt: Date.now() + 1000, deleted: false, entries: [entry('Squat', 2000)] };
    await call('POST', '/sync', founder.token, { cursor: 0, loggedWorkouts: [session], savedWorkouts: [] });
    const calls = await call<CallView[]>('GET', '/calls', friend.token);
    expect(calls.body[0]?.status).toBe('open');
    const joke = await call<{ id: string }>('POST', '/posts', founder.token, { id: randomUUID(), kind: 'workout', title: 'Sure', caption: '', showWeights: true, entries: [entry('Bench press', 2000)], recipientIds: [] });
    expect((await call('POST', `/posts/${joke.body.id}/calls`, friend.token, { exercise: 'Bench press', line: 'No.' })).status).toBe(400);
  });

  it('lets friends nudge once a day, and nobody else at all', async () => {
    const { founder, friend } = await crew();
    const outsider = await register('outsider', friend.user.inviteCode);
    await call('DELETE', `/friends/${outsider.user.id}`, friend.token);
    expect((await call('POST', `/friends/${friend.user.id}/nudge`, founder.token)).status).toBe(204);
    expect((await call('POST', `/friends/${friend.user.id}/nudge`, founder.token)).status).toBe(409);
    expect((await call('POST', `/friends/${founder.user.id}/nudge`, friend.token)).status).toBe(204);
    expect((await call('POST', `/friends/${founder.user.id}/nudge`, outsider.token)).status).toBe(404);
    expect((await call('POST', '/friends/not-a-uuid/nudge', founder.token)).status).toBe(404);
    const news = await call<NotificationView[]>('GET', '/notifications', friend.token);
    expect(news.body.filter((item) => item.title === 'founder nudged you')).toHaveLength(1);
  });

  it('counts real joins, befriends both sides, and ignores adding existing users', async () => {
    const { founder, friend } = await crew();
    await register('third', founder.user.inviteCode);
    const outsider = await register('outsider', friend.user.inviteCode);
    await call('POST', '/friends', outsider.token, { inviteCode: founder.user.inviteCode });

    const summary = await call<InviteSummary>('GET', '/invites', founder.token);
    expect(summary.body.joined).toBe(2);
    expect(summary.body.nextGoal).toEqual({ count: 3, name: 'Recruiter' });
    const friends = await call<unknown[]>('GET', '/friends', founder.token);
    expect(friends.body).toHaveLength(3);
  });
});

describe('sync', () => {
  it('round-trips and only returns what is new', async () => {
    const { founder } = await crew();
    const first = await sync(founder.token, 0, [logged('w1', [entry('Row', 90)])]);
    expect(first.body.loggedWorkouts.map((doc) => doc.id)).toEqual(['w1']);
    const second = await sync(founder.token, first.body.cursor);
    expect(second.body.loggedWorkouts).toEqual([]);
  });

  it('keeps the newest write and sends a stale writer the winner', async () => {
    const { founder } = await crew();
    const { body } = await sync(founder.token, 0, [logged('w1', [entry('Row', 90)], { updatedAt: 2000, title: 'New' })]);
    const stale = await sync(founder.token, body.cursor, [logged('w1', [entry('Row', 50)], { updatedAt: 1000, title: 'Old' })]);
    expect(stale.body.loggedWorkouts[0]?.title).toBe('New');
  });

  it('keeps each person’s documents separate, even with the same id', async () => {
    const { founder, friend } = await crew();
    await sync(founder.token, 0, [logged('same', [entry('Row', 90)], { title: 'Mine' })]);
    const theirs = await sync(friend.token, 0, [logged('same', [entry('Row', 40)], { title: 'Theirs' })]);
    expect(theirs.body.loggedWorkouts.map((doc) => doc.title)).toEqual(['Theirs']);
  });

  it('rejects timestamps from far in the future', async () => {
    const { founder } = await crew();
    const result = await sync(founder.token, 0, [logged('w1', [], { updatedAt: Date.now() + 3 * 86_400_000 })]);
    expect(result.status).toBe(400);
  });
});

describe('feed privacy', () => {
  it('hides posts from people outside the crew', async () => {
    const { founder } = await crew();
    const created = await post(founder.token);
    const outsider = await register('outsider', (await register('other', founder.user.inviteCode)).user.inviteCode);
    expect((await call<PostView[]>('GET', '/feed', outsider.token)).body).toEqual([]);
    expect((await call('GET', `/posts/${created.body.id}`, outsider.token)).status).toBe(404);
    expect((await call('PUT', `/posts/${created.body.id}/respect`, outsider.token)).status).toBe(404);
  });

  it('strips hidden weights and notes on the server', async () => {
    const { founder, friend } = await crew();
    await post(founder.token, { showWeights: false, entries: [entry('Lat pulldown', 86, { note: 'secret', includesEquipment: true })] });
    const [seen] = (await call<PostView[]>('GET', '/feed', friend.token)).body;
    expect(seen?.entries[0]?.weight).toBeNull();
    expect(seen?.entries[0]?.note).toBe('');
    expect(seen?.entries[0]?.includesEquipment).toBeUndefined();
    const [own] = (await call<PostView[]>('GET', '/feed', founder.token)).body;
    expect(own?.entries[0]?.weight).toBe(86);
    expect(own?.entries[0]?.includesEquipment).toBe(true);
  });

  it('respects a specific recipient list', async () => {
    const { founder, friend } = await crew();
    const third = await register('third', founder.user.inviteCode);
    await post(founder.token, { recipientIds: [friend.user.id] });
    expect((await call<PostView[]>('GET', '/feed', friend.token)).body).toHaveLength(1);
    expect((await call<PostView[]>('GET', '/feed', third.token)).body).toHaveLength(0);
  });

  it('refuses sharing with non-friends', async () => {
    const { founder } = await crew();
    const result = await post(founder.token, { recipientIds: ['00000000-0000-4000-8000-000000000000'] });
    expect(result.status).toBe(400);
  });

  it('only lets the author delete a post', async () => {
    const { founder, friend } = await crew();
    const created = await post(founder.token);
    expect((await call('DELETE', `/posts/${created.body.id}`, friend.token)).status).toBe(403);
    expect((await call('DELETE', `/posts/${created.body.id}`, founder.token)).status).toBe(204);
  });
});

describe('saving a shared workout', () => {
  it('copies exercises without weights, syncs, counts and notifies', async () => {
    const { founder, friend } = await crew();
    const shared = await post(founder.token, { kind: 'share', title: 'Upper A' });
    const saved = await call<{ exercises: unknown[]; savedFrom: string }>('POST', `/posts/${shared.body.id}/save`, friend.token);
    expect(saved.status).toBe(200);
    expect(saved.body.savedFrom).toBe('founder');
    expect(JSON.stringify(saved.body.exercises)).not.toContain('weight');
    expect((await sync(friend.token, 0)).body.savedWorkouts).toHaveLength(1);
    expect((await call('POST', `/posts/${shared.body.id}/save`, friend.token)).status).toBe(409);
    const [seen] = (await call<PostView[]>('GET', '/feed', founder.token)).body;
    expect(seen?.saveCount).toBe(1);
    const notes = await call<{ title: string }[]>('GET', '/notifications', founder.token);
    expect(notes.body.map((note) => note.title)).toContain('Workout saved');
  });
});

describe('sandbag calls', () => {
  async function called() {
    const { founder, friend } = await crew();
    const created = await post(friend.token);
    const result = await call('POST', `/posts/${created.body.id}/calls`, founder.token, { exercise: 'lat PULLDOWN', line: 'That looked easy.' });
    expect(result.status).toBe(201);
    return { founder, friend, postId: created.body.id };
  }
  const later = () => ({ updatedAt: Date.now() + 1000 });

  it('clears the call when the next session beats it', async () => {
    const { founder, friend } = await called();
    await sync(friend.token, 0, [logged('w2', [entry('Lat Pulldown', 88.5)], later())]);
    const [theCall] = (await call<CallView[]>('GET', '/calls', friend.token)).body;
    expect(theCall?.status).toBe('cleared');
    const rows = (await call<RankingRow[]>('GET', '/rankings', founder.token)).body;
    expect(rows.find((row) => row.user.id === friend.user.id)?.wearingSandbag).toBe(false);
  });

  it('puts the sandbag on when the next session does not beat it', async () => {
    const { founder, friend } = await called();
    await sync(friend.token, 0, [logged('w2', [entry('Lat pulldown', 86)], later())]);
    const rows = (await call<RankingRow[]>('GET', '/rankings', founder.token)).body;
    expect(rows.find((row) => row.user.id === friend.user.id)?.wearingSandbag).toBe(true);
  });

  it('ignores workouts that do not include the lift, and older ones', async () => {
    const { friend } = await called();
    await sync(friend.token, 0, [logged('w2', [entry('Row', 200)], later()), logged('w3', [entry('Lat pulldown', 200)], { updatedAt: 1000 })]);
    const [theCall] = (await call<CallView[]>('GET', '/calls', friend.token)).body;
    expect(theCall?.status).toBe('open');
  });

  it('allows one open call per lift and no self-calls', async () => {
    const { founder, friend, postId } = await called();
    const third = await register('third', friend.user.inviteCode);
    expect((await call('POST', `/posts/${postId}/calls`, third.token, { exercise: 'Lat pulldown', line: 'Me too.' })).status).toBe(409);
    expect((await call('POST', `/posts/${postId}/calls`, friend.token, { exercise: 'Lat pulldown', line: 'Me.' })).status).toBe(400);
    expect(founder).toBeDefined();
  });

  it('does not reveal a hidden weight to the caller', async () => {
    const { founder, friend } = await crew();
    const created = await post(friend.token, { showWeights: false });
    await call('POST', `/posts/${created.body.id}/calls`, founder.token, { exercise: 'Lat pulldown', line: 'Hm.' });
    const [asCaller] = (await call<CallView[]>('GET', '/calls', founder.token)).body;
    const [asTarget] = (await call<CallView[]>('GET', '/calls', friend.token)).body;
    expect(asCaller?.targetWeight).toBeNull();
    expect(asTarget?.targetWeight).toBe(86);
  });
});

describe('sandbag calls can’t be dodged', () => {
  async function called(overrides: Record<string, unknown> = {}) {
    const { founder, friend } = await crew();
    const created = await post(friend.token, overrides);
    const result = await call('POST', `/posts/${created.body.id}/calls`, founder.token, { exercise: 'Lat pulldown', line: 'Hm.' });
    expect(result.status).toBe(201);
    return { founder, friend, postId: created.body.id };
  }
  const later = () => ({ updatedAt: Date.now() + 1000 });
  const statusOf = async (token: string) => (await call<CallView[]>('GET', '/calls', token)).body[0]?.status;
  const called2 = async (founder: AuthResponse, friend: AuthResponse) => {
    const fresh = await post(friend.token, { entries: [entry('Row', 90)] });
    expect((await call('POST', `/posts/${fresh.body.id}/calls`, founder.token, { exercise: 'Row', line: 'Again.' })).status).toBe(201);
    return 'Row';
  };
  const badge = async (founder: AuthResponse, friend: AuthResponse) =>
    (await call<RankingRow[]>('GET', '/rankings', founder.token)).body.find((row) => row.user.id === friend.user.id)?.wearingSandbag;

  it('isn’t fooled by a typo or another name for the lift', async () => {
    const { friend } = await called();
    await sync(friend.token, 0, [logged('w', [entry('Lat pulldwn', 50)], later())]);
    expect(await statusOf(friend.token)).toBe('failed');
  });

  it('can’t be answered with a blank weight or a different setup, and the deadline still comes', async () => {
    const { founder, friend } = await called();
    await sync(friend.token, 0, [logged('w1', [entry('Lat pulldown', null)], later()), logged('w2', [entry('Lat pulldown', 200, { perSide: true })], later())]);
    expect(await statusOf(friend.token)).toBe('open');
    await db.update(schema.sandbagCalls).set({ deadlineAt: new Date(Date.now() - 1000) });
    expect(await statusOf(friend.token)).toBe('failed');
    expect(await badge(founder, friend)).toBe(true);
    const notes = await call<NotificationView[]>('GET', '/notifications', friend.token);
    expect(notes.body.map((note) => note.title)).toContain('Sandbag');
  });

  it('tells only the person called out which session settled it', async () => {
    const { founder, friend } = await called();
    await sync(friend.token, 0, [logged('answer', [entry('Lat pulldown', 200)], later())]);
    const [mine] = (await call<CallView[]>('GET', '/calls', friend.token)).body;
    const [theirs] = (await call<CallView[]>('GET', '/calls', founder.token)).body;
    expect(mine?.settledBy).toBe('answer');
    expect(theirs?.settledBy).toBeNull();
  });

  it('looks at the heavy entry when a session holds the lift twice', async () => {
    const { friend } = await called();
    await sync(friend.token, 0, [logged('w', [entry('Lat pulldown', 20), entry('Lat pulldown', 200)], later())]);
    expect(await statusOf(friend.token)).toBe('cleared');
  });

  it('calls the heavy entry when a post holds the lift twice', async () => {
    const { founder, friend } = await crew();
    const created = await post(friend.token, { entries: [entry('Lat pulldown', 20), entry('Lat pulldown', 90)] });
    expect((await call('POST', `/posts/${created.body.id}/calls`, founder.token, { exercise: 'Lat pulldown', line: 'Hm.' })).status).toBe(201);
    const [theCall] = await db.select().from(schema.sandbagCalls);
    expect(theCall?.targetWeight).toBe(90);
  });

  it('reopens when the session that cleared it is deleted or edited down', async () => {
    const { friend } = await called();
    const doc = logged('fake', [entry('Lat pulldown', 200)], later());
    await sync(friend.token, 0, [doc]);
    expect(await statusOf(friend.token)).toBe('cleared');
    await sync(friend.token, 0, [{ ...doc, deleted: true, updatedAt: Date.now() + 5000 }]);
    expect(await statusOf(friend.token)).toBe('open');
    const again = logged('fake2', [entry('Lat pulldown', 200)], later());
    await sync(friend.token, 0, [again]);
    expect(await statusOf(friend.token)).toBe('cleared');
    await sync(friend.token, 0, [{ ...again, entries: [entry('Lat pulldown', 50)], updatedAt: Date.now() + 9000 }]);
    expect(await statusOf(friend.token)).toBe('failed');
  });

  it('gives a failed session one correction, and the caller hears about it', async () => {
    const { founder, friend } = await called();
    const doc = logged('weak', [entry('Lat pulldown', 50)], later());
    await sync(friend.token, 0, [doc]);
    expect(await statusOf(friend.token)).toBe('failed');
    expect(await badge(founder, friend)).toBe(true);
    await sync(friend.token, 0, [{ ...doc, entries: [entry('Lat pulldown', 200)], updatedAt: Date.now() + 5000 }]);
    expect(await statusOf(friend.token)).toBe('cleared');
    expect(await badge(founder, friend)).toBe(false);
    const notes = (await call<NotificationView[]>('GET', '/notifications', founder.token)).body;
    expect(notes.some((note) => note.title === 'Session edited')).toBe(true);
    // Back down and up again doesn't get a second one.
    await sync(friend.token, 0, [{ ...doc, entries: [entry('Lat pulldown', 50)], updatedAt: Date.now() + 9000 }]);
    expect(await statusOf(friend.token)).toBe('failed');
    await sync(friend.token, 0, [{ ...doc, entries: [entry('Lat pulldown', 200)], updatedAt: Date.now() + 13_000 }]);
    expect(await statusOf(friend.token)).toBe('failed');
  });

  it('won’t let a failed session be fixed a day later, or deleted away', async () => {
    const { founder, friend } = await called();
    const doc = logged('weak', [entry('Lat pulldown', 50)], later());
    await sync(friend.token, 0, [doc]);
    await sync(friend.token, 0, [{ ...doc, deleted: true, updatedAt: Date.now() + 5000 }]);
    expect(await statusOf(friend.token)).toBe('failed');
    expect(await badge(founder, friend)).toBe(true);
    const other = await called2(founder, friend);
    const second = logged('weak2', [entry(other, 50)], later());
    await sync(friend.token, 0, [second]);
    await db.update(schema.sandbagCalls).set({ resolvedAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(schema.sandbagCalls.exercise, other));
    await sync(friend.token, 0, [{ ...second, entries: [entry(other, 200)], updatedAt: Date.now() + 9000 }]);
    const rows = (await call<CallView[]>('GET', '/calls', friend.token)).body;
    expect(rows.find((row) => row.exercise === other)?.status).toBe('failed');
  });

  it('looks through the other sessions when the one that settled a call goes', async () => {
    const { friend } = await called();
    const first = logged('first', [entry('Lat pulldown', 200)], later());
    const second = logged('second', [entry('Lat pulldown', 50)], later());
    await sync(friend.token, 0, [first]);
    await sync(friend.token, 0, [second]);
    expect(await statusOf(friend.token)).toBe('cleared');
    await sync(friend.token, 0, [{ ...first, deleted: true, updatedAt: Date.now() + 5000 }]);
    expect(await statusOf(friend.token)).toBe('failed');
  });

  it('looks at an honest miss again when its session changes', async () => {
    const { friend } = await called();
    const doc = logged('close', [entry('Lat pulldown', 84, { rpe: 10 })], later());
    await sync(friend.token, 0, [doc]);
    expect(await statusOf(friend.token)).toBe('watching');
    await sync(friend.token, 0, [{ ...doc, entries: [entry('Lat pulldown', 30, { rpe: 7 })], updatedAt: Date.now() + 5000 }]);
    expect(await statusOf(friend.token)).toBe('failed');
  });

  it('won’t let the same post be called twice, even after a verdict', async () => {
    const { founder, friend, postId } = await called();
    await sync(friend.token, 0, [logged('w', [entry('Lat pulldown', 200)], later())]);
    expect((await call('POST', `/posts/${postId}/calls`, founder.token, { exercise: 'Lat pulldown', line: 'Again.' })).status).toBe(409);
  });

  it('refuses to call an old post, and limits how many you can have open', async () => {
    const { founder, friend, postId } = await called();
    await db.update(schema.posts).set({ createdAt: new Date(Date.now() - 15 * 86_400_000) }).where(eq(schema.posts.id, postId));
    const third = await register('third', friend.user.inviteCode);
    expect((await call('POST', `/posts/${postId}/calls`, third.token, { exercise: 'Lat pulldown', line: 'Late.' })).status).toBe(400);
    for (const name of ['Row', 'Curl']) {
      const fresh = await post(friend.token, { entries: [entry(name, 50)] });
      expect((await call('POST', `/posts/${fresh.body.id}/calls`, founder.token, { exercise: name, line: 'x' })).status).toBe(201);
    }
    const fourth = await post(friend.token, { entries: [entry('Press', 50)] });
    expect((await call('POST', `/posts/${fourth.body.id}/calls`, founder.token, { exercise: 'Press', line: 'x' })).status).toBe(409);
  });

  it('forgives a close miss at full effort, until you lift well past it', async () => {
    const { founder, friend } = await called();
    await sync(friend.token, 0, [logged('close', [entry('Lat pulldown', 84, { rpe: 10 })], later())]);
    expect(await statusOf(friend.token)).toBe('watching');
    expect(await badge(founder, friend)).toBe(false);
    await sync(friend.token, 0, [logged('past', [entry('Lat pulldown', 95, { rpe: 7 })], { updatedAt: Date.now() + 3000 })]);
    expect(await statusOf(friend.token)).toBe('confirmed');
    expect(await badge(founder, friend)).toBe(true);
    const [row] = (await call<CallView[]>('GET', '/calls', friend.token)).body;
    expect(row?.points).toBe(-10);
    expect((await call<CallView[]>('GET', '/calls', founder.token)).body[0]?.points).toBe(10);
  });

  it('believes a watched miss once the two weeks are up', async () => {
    const { friend } = await called();
    await sync(friend.token, 0, [logged('close', [entry('Lat pulldown', 84, { rpe: 10 })], later())]);
    await db.update(schema.sandbagCalls).set({ deadlineAt: new Date(Date.now() - 1000) });
    expect(await statusOf(friend.token)).toBe('honest');
  });

  it('tells the person called what happened, not only the caller', async () => {
    const { friend } = await called();
    await sync(friend.token, 0, [logged('w', [entry('Lat pulldown', 50)], later())]);
    const notes = await call<NotificationView[]>('GET', '/notifications', friend.token);
    expect(notes.body.map((note) => note.title)).toContain('Sandbag');
  });

  it('puts a settled call in both scores, and only so far', async () => {
    const { founder, friend } = await called();
    await sync(friend.token, 0, [logged('w', [entry('Lat pulldown', 50)], later())]);
    const rows = (await call<RankingRow[]>('GET', '/rankings', founder.token)).body;
    expect(rows.find((row) => row.user.id === founder.user.id)?.bonuses?.calls).toBe(5);
    expect(rows.find((row) => row.user.id === friend.user.id)?.bonuses?.calls).toBe(-5);
  });
});

describe('dates can’t be gamed', () => {
  it('refuses a session dated in the future over sync', async () => {
    const founder = await register('founder', BOOTSTRAP);
    expect((await sync(founder.token, 0, [logged('w', [entry('Curl', 10)], { date: '2099-01-01' })])).status).toBe(400);
  });

  it('gives nothing for a low number backdated through the public API', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const { key } = (await call<{ key: string }>('POST', '/me/api-keys', founder.token, { name: 'k', password: 'correct horse battery' })).body as { key: string };
    await sync(founder.token, 0, [logged('now', [entry('Squat', 100)])]);
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
    await call('POST', '/v1/workouts', key, { workouts: [{ date: old, entries: [{ name: 'Squat', weight: 1, sets: 3, reps: 8 }] }] });
    const [row] = (await call<RankingRow[]>('GET', '/rankings', founder.token)).body;
    expect(row?.progress).toBe(0);
  });

  it('treats moving a session to another day as a new number', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const doc = logged('w', [entry('Squat', 100)]);
    await sync(founder.token, 0, [doc]);
    const stamp = new Date(Date.now() - 30 * 86_400_000);
    await db.update(schema.loggedWorkouts).set({ recordedAt: stamp });
    await sync(founder.token, 0, [{ ...doc, date: '2020-01-01', updatedAt: Date.now() + 5000 }]);
    const [moved] = await db.select().from(schema.loggedWorkouts);
    expect(moved?.recordedAt.getTime()).toBeGreaterThan(stamp.getTime());
  });

  it('keeps how long a session took', async () => {
    const founder = await register('founder', BOOTSTRAP);
    await sync(founder.token, 0, [logged('timed', [entry('Squat', 100)], { durationSeconds: 3180 })]);
    const back = await sync(founder.token, 0);
    expect(back.body.loggedWorkouts.find((doc) => doc.id === 'timed')?.durationSeconds).toBe(3180);
    expect((await sync(founder.token, 0, [logged('forever', [entry('Squat', 100)], { durationSeconds: 90_000 })])).status).toBe(400);
  });

  it('keeps a session’s standing when only its title is edited', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const doc = logged('w', [entry('Squat', 100)]);
    await sync(founder.token, 0, [doc]);
    const stamp = new Date(Date.now() - 86_400_000);
    await db.update(schema.loggedWorkouts).set({ recordedAt: stamp });
    await sync(founder.token, 0, [{ ...doc, title: 'Renamed', updatedAt: Date.now() + 5000 }]);
    const [row] = await db.select().from(schema.loggedWorkouts);
    expect(row?.recordedAt.getTime()).toBe(stamp.getTime());
    await sync(founder.token, 0, [{ ...doc, entries: [entry('Squat', 90)], updatedAt: Date.now() + 9000 }]);
    const [edited] = await db.select().from(schema.loggedWorkouts);
    expect(edited?.recordedAt.getTime()).toBeGreaterThan(stamp.getTime());
  });
});

describe('crews and seasons', () => {
  const DAY = 86_400_000;
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  const dayOfWeek = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const mondayOf = (date: string) => iso(Date.parse(`${date}T00:00:00Z`) - dayOfWeek(date) * DAY);
  const thisMonday = mondayOf(iso(Date.now()));
  const weeksAgo = (weeks: number) => iso(Date.parse(`${thisMonday}T00:00:00Z`) - weeks * 7 * DAY);

  const startCrew = async () => {
    const { founder, friend } = await crew();
    const created = await call<CrewView>('POST', '/crew', founder.token, { name: 'Basement' });
    expect(created.status).toBe(201);
    expect((await call('POST', '/crew/join', friend.token, { inviteCode: founder.user.inviteCode })).status).toBe(200);
    return { founder, friend, crewId: created.body.id };
  };
  /** Moves the crew back in time, so a week has really finished. */
  const backdate = async (crewId: string, weeks: number) => {
    await db.update(schema.crews).set({ seasonStart: weeksAgo(weeks) }).where(eq(schema.crews.id, crewId));
    await db.update(schema.crewMembers).set({ joinedAt: new Date(`${weeksAgo(weeks + 1)}T00:00:00Z`) });
  };
  const trained = async (who: AuthResponse, id: string, week: string, weight = 100) => {
    await sync(who.token, 0, [logged(id, [entry('Curl', weight)], { date: week })]);
    await db.update(schema.loggedWorkouts).set({ recordedAt: new Date(`${week}T20:00:00Z`) }).where(eq(schema.loggedWorkouts.id, id));
  };

  it('starts next Monday, shows everyone a table, and makes the crew friends', async () => {
    const { founder, friend } = await startCrew();
    const third = await register('third', friend.user.inviteCode);
    await call('POST', '/crew/join', third.token, { inviteCode: founder.user.inviteCode });
    const view = (await call<CrewView>('GET', '/crew', third.token)).body;
    expect(view.week).toBe(0);
    expect(view.startsOn > iso(Date.now())).toBe(true);
    expect(view.members).toHaveLength(3);
    expect(view.match).toBeNull();
    expect((await call<unknown[]>('GET', '/friends', third.token)).body).toHaveLength(2);
    await call('POST', '/crew/leave', third.token);
    expect((await call('GET', '/crew', third.token)).body).toBeNull();
  });

  it('allows one crew at a time, and only a real code gets you in', async () => {
    const { founder, friend } = await startCrew();
    expect((await call('POST', '/crew', friend.token, { name: 'Other' })).status).toBe(409);
    expect((await call('POST', '/crew/join', friend.token, { inviteCode: founder.user.inviteCode })).status).toBe(409);
    const stranger = await register('stranger', founder.user.inviteCode);
    await call('POST', '/crew/leave', stranger.token);
    expect((await call('POST', '/crew/join', stranger.token, { inviteCode: 'NOPENOPE' })).status).toBe(404);
  });

  it('brings a recruit into the inviter’s crew', async () => {
    const { founder } = await startCrew();
    const recruit = await register('recruit', founder.user.inviteCode);
    expect((await call<CrewView>('GET', '/crew', recruit.token)).body.members).toHaveLength(3);
  });

  it('settles a finished week once, however many people look', async () => {
    const { founder, friend, crewId } = await startCrew();
    await backdate(crewId, 1);
    await trained(founder, 'a1', weeksAgo(1));
    await trained(founder, 'a2', iso(Date.parse(weeksAgo(1)) + DAY));
    await trained(friend, 'b1', weeksAgo(1));
    await Promise.all([call('GET', '/crew', founder.token), call('GET', '/crew', friend.token)]);
    await call('GET', '/crew', founder.token);
    const view = (await call<CrewView>('GET', '/crew', founder.token)).body;
    const me = view.members.find((member) => member.user.id === founder.user.id);
    const them = view.members.find((member) => member.user.id === friend.user.id);
    expect(me?.rating).toBe(1016);
    expect(them?.rating).toBe(984);
    expect(view.lastMatch).toMatchObject({ ratingChange: 16, note: 'match' });
    expect(await db.select().from(schema.crewWeeks)).toHaveLength(1);
    const notes = await call<NotificationView[]>('GET', '/notifications', friend.token);
    expect(notes.body.filter((note) => note.title === 'Week settled')).toHaveLength(1);
  });

  it('ignores a session added after the week closed', async () => {
    const { founder, friend, crewId } = await startCrew();
    await backdate(crewId, 1);
    await trained(founder, 'a1', weeksAgo(1));
    await sync(friend.token, 0, [logged('late', [entry('Curl', 100)], { date: weeksAgo(1) })]);
    const view = (await call<CrewView>('GET', '/crew', founder.token)).body;
    expect(view.lastMatch).toMatchObject({ theirScore: expect.any(Number) });
    expect(view.members.find((member) => member.user.id === founder.user.id)?.rating).toBe(1016);
  });

  it('costs rating for a week of nothing, whatever your goal', async () => {
    const { founder, friend, crewId } = await startCrew();
    await backdate(crewId, 1);
    await trained(founder, 'a1', weeksAgo(1));
    const view = (await call<CrewView>('GET', '/crew', founder.token)).body;
    expect(view.members.find((member) => member.user.id === friend.user.id)?.rating).toBe(1000 - 16 - 15);
  });

  it('makes leaving during the week a forfeit, so Sunday isn’t a way out', async () => {
    const { founder, friend, crewId } = await startCrew();
    await backdate(crewId, 1);
    await trained(founder, 'a1', weeksAgo(1), 50);
    await trained(friend, 'b1', weeksAgo(1));
    await trained(friend, 'b2', iso(Date.parse(weeksAgo(1)) + DAY));
    await db.update(schema.crewMembers).set({ leftAt: new Date(`${iso(Date.parse(weeksAgo(1)) + 6 * DAY)}T22:00:00Z`) }).where(eq(schema.crewMembers.userId, friend.user.id));
    const view = (await call<CrewView>('GET', '/crew', founder.token)).body;
    expect(view.lastMatch).toMatchObject({ ratingChange: 16, note: 'forfeit' });
    expect(view.lastMatch?.opponent?.id).toBe(friend.user.id);
    const [left] = await db.select().from(schema.crewMembers).where(eq(schema.crewMembers.userId, friend.user.id));
    expect(left?.rating).toBe(984);
    const notes = (await call<NotificationView[]>('GET', '/notifications', friend.token)).body;
    expect(notes.some((note) => note.body.includes('You walked out'))).toBe(true);
  });

  it('plays the match if you only left after the week ended', async () => {
    const { founder, friend, crewId } = await startCrew();
    await backdate(crewId, 1);
    await trained(founder, 'a1', weeksAgo(1));
    await trained(founder, 'a2', iso(Date.parse(weeksAgo(1)) + DAY));
    await trained(friend, 'b1', weeksAgo(1));
    await db.update(schema.crewMembers).set({ leftAt: new Date(`${thisMonday}T00:30:00Z`) }).where(eq(schema.crewMembers.userId, friend.user.id));
    const view = (await call<CrewView>('GET', '/crew', founder.token)).body;
    expect(view.lastMatch).toMatchObject({ ratingChange: 16, note: 'match' });
  });

  it('doesn’t blame someone the admin removed', async () => {
    const { founder, friend, crewId } = await startCrew();
    await backdate(crewId, 1);
    await trained(founder, 'a1', weeksAgo(1));
    const at = new Date(`${weeksAgo(1)}T22:00:00Z`);
    await db.update(schema.crewMembers).set({ leftAt: at, removedAt: at }).where(eq(schema.crewMembers.userId, friend.user.id));
    const view = (await call<CrewView>('GET', '/crew', founder.token)).body;
    expect(view.lastMatch?.note).toBe('bye');
    const [left] = await db.select().from(schema.crewMembers).where(eq(schema.crewMembers.userId, friend.user.id));
    expect(left?.rating).toBe(1000);
  });

  it('keeps your place in the week if you leave and come straight back', async () => {
    const { founder, friend, crewId } = await startCrew();
    await backdate(crewId, 0);
    const [before] = await db.select().from(schema.crewMembers).where(eq(schema.crewMembers.userId, friend.user.id));
    await call('POST', '/crew/leave', friend.token);
    await call('POST', '/crew/join', friend.token, { inviteCode: founder.user.inviteCode });
    const [after] = await db.select().from(schema.crewMembers).where(eq(schema.crewMembers.userId, friend.user.id));
    expect(after?.joinedAt.getTime()).toBe(before?.joinedAt.getTime());
    expect((await call<CrewView>('GET', '/crew', founder.token)).body.match?.opponent?.id).toBe(friend.user.id);
  });

  it('stops you seeing the crew’s posts once you leave, but not your inviter’s', async () => {
    const { founder, friend } = await startCrew();
    const third = await register('third', friend.user.inviteCode);
    const seenBy = async (who: AuthResponse) => (await call<{ id: string }[]>('GET', '/friends', who.token)).body.map((row) => row.id);
    expect(await seenBy(third)).toContain(founder.user.id);
    const mine = await post(founder.token);
    expect((await call('GET', `/posts/${mine.body.id}`, third.token)).status).toBe(200);
    await call('POST', '/crew/leave', third.token);
    expect(await seenBy(third)).not.toContain(founder.user.id);
    expect(await seenBy(third)).toContain(friend.user.id);
    expect((await call('GET', `/posts/${mine.body.id}`, third.token)).status).toBe(404);
  });

  it('keeps your rating if you walk out and come back', async () => {
    const { founder, friend, crewId } = await startCrew();
    await db.update(schema.crewMembers).set({ rating: 700 }).where(eq(schema.crewMembers.userId, friend.user.id));
    await call('POST', '/crew/leave', friend.token);
    expect((await call('GET', '/crew', friend.token)).body).toBeNull();
    await call('POST', '/crew/join', friend.token, { inviteCode: founder.user.inviteCode });
    const view = (await call<CrewView>('GET', '/crew', friend.token)).body;
    expect(view.members.find((member) => member.user.id === friend.user.id)?.rating).toBe(700);
    expect(view.id).toBe(crewId);
  });

  it('ends the season after 8 weeks, names a champion and levels everyone', async () => {
    const { founder, friend, crewId } = await startCrew();
    await backdate(crewId, 8);
    await db.update(schema.crewMembers).set({ rating: 1200 }).where(eq(schema.crewMembers.userId, founder.user.id));
    const view = (await call<CrewView>('GET', '/crew', friend.token)).body;
    expect(view.season).toBe(2);
    expect(view.lastChampion?.id).toBe(founder.user.id);
    expect(view.members.every((member) => member.rating === 1000)).toBe(true);
    expect(view.week).toBe(1);
  });

  it('lets only the admin rename or remove, and hands over when the admin leaves', async () => {
    const { founder, friend } = await startCrew();
    const third = await register('third', founder.user.inviteCode);
    expect((await call('PATCH', '/crew', friend.token, { name: 'Mine' })).status).toBe(403);
    expect((await call('DELETE', `/crew/members/${third.user.id}`, friend.token)).status).toBe(403);
    expect((await call('PATCH', '/crew', founder.token, { name: 'New name' })).status).toBe(200);
    expect((await call('DELETE', `/crew/members/${third.user.id}`, founder.token)).status).toBe(204);
    expect((await call('GET', '/crew', third.token)).body).toBeNull();
    await call('POST', '/crew/leave', founder.token);
    expect((await call<CrewView>('GET', '/crew', friend.token)).body.isAdmin).toBe(true);
  });

  it('needs someone else to approve a pause, which holds the streak and delays calls', async () => {
    const { founder, friend, crewId } = await startCrew();
    const created = await post(friend.token);
    await call('POST', `/posts/${created.body.id}/calls`, founder.token, { exercise: 'Lat pulldown', line: 'Hm.' });
    const before = (await db.select().from(schema.sandbagCalls))[0]!.deadlineAt.getTime();
    const asked = await call<{ id: string }>('POST', '/crew/pause', friend.token, { weeks: 2 });
    expect(asked.status).toBe(201);
    expect((await call('POST', '/crew/pause', friend.token, { weeks: 1 })).status).toBe(409);
    expect((await call('POST', `/crew/pauses/${asked.body.id}/approve`, friend.token)).status).toBe(403);
    const pending = (await call<CrewView>('GET', '/crew', founder.token)).body.pauses[0];
    expect(pending).toMatchObject({ status: 'pending', canDecide: true });
    expect((await call('POST', `/crew/pauses/${asked.body.id}/approve`, founder.token)).status).toBe(204);
    expect((await call('POST', `/crew/pauses/${asked.body.id}/approve`, founder.token)).status).toBe(409);
    const after = (await db.select().from(schema.sandbagCalls))[0]!.deadlineAt.getTime();
    expect(after - before).toBe(14 * DAY);
    await backdate(crewId, 0);
    expect((await call<CrewView>('GET', '/crew', founder.token)).body.members.find((member) => member.user.id === friend.user.id)?.paused).toBe(true);
  });

  it('won’t approve a pause for someone in another crew, or for yourself alone', async () => {
    const { founder, friend } = await startCrew();
    const asked = await call<{ id: string }>('POST', '/crew/pause', friend.token, { weeks: 1 });
    const outsider = await register('outsider', founder.user.inviteCode);
    await call('POST', '/crew/leave', outsider.token);
    await call('POST', '/crew', outsider.token, { name: 'Other' });
    expect((await call('POST', `/crew/pauses/${asked.body.id}/approve`, outsider.token)).status).toBe(404);
    expect((await call('POST', '/crew/pause', outsider.token, { weeks: 1 })).status).toBe(400);
  });
});

describe('rankings', () => {
  it('ranks the crew only, by score', async () => {
    const { founder, friend } = await crew();
    await register('outsider', friend.user.inviteCode);
    await sync(founder.token, 0, [logged('w1', [entry('Row', 90)])]);
    const rows = (await call<RankingRow[]>('GET', '/rankings?period=week', founder.token)).body;
    expect(rows.map((row) => row.user.username)).toEqual(['founder', 'friend']);
    expect(rows[0]?.rank).toBe(1);
    expect(JSON.stringify(rows)).not.toContain('"weight"');
  });

  it('rejects an unknown period', async () => {
    const { founder } = await crew();
    expect((await call('GET', '/rankings?period=year', founder.token)).status).toBe(400);
  });
});

describe('account deletion', () => {
  it('removes the account and everything it posted', async () => {
    const { founder, friend } = await crew();
    await post(friend.token);
    expect((await call('DELETE', '/me', friend.token, { password: 'correct horse battery' })).status).toBe(204);
    expect((await call('GET', '/me', friend.token)).status).toBe(401);
    expect((await call<PostView[]>('GET', '/feed', founder.token)).body).toEqual([]);
  });
});

describe('rankings', () => {
  it('gives equal scores the same rank and skips the next', async () => {
    const { founder, friend } = await crew();
    const third = await register('third', founder.user.inviteCode);
    await call('POST', '/friends', third.token, { inviteCode: friend.user.inviteCode });
    await sync(founder.token, 0, [logged('a', [entry('Curl', 10)])]);
    await sync(friend.token, 0, [logged('b', [entry('Curl', 10)])]);
    const rows = await call<RankingRow[]>('GET', '/rankings?period=week', founder.token);
    expect(rows.body.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it('accepts an empty workout over sync but does not rank it', async () => {
    const founder = await register('founder', BOOTSTRAP);
    expect((await sync(founder.token, 0, [logged('empty', [])])).status).toBe(200);
    const rows = await call<RankingRow[]>('GET', '/rankings?period=week', founder.token);
    expect(rows.body[0]?.workouts).toBe(0);
  });
});

describe('hardening', () => {
  it('accepts invite codes in any case', async () => {
    const founder = await register('founder', BOOTSTRAP.toUpperCase());
    await register('friend', founder.user.inviteCode.toLowerCase());
  });

  it('treats a resent post as the same post', async () => {
    const { founder, friend } = await crew();
    const id = randomUUID();
    expect((await post(founder.token, { id })).status).toBe(201);
    expect((await post(founder.token, { id })).status).toBe(200);
    const feed = await call<PostView[]>('GET', '/feed', friend.token);
    expect(feed.body).toHaveLength(1);
    expect((await post(friend.token, { id })).status).toBe(409);
  });

  it('changes a password, keeps this device and signs out the others', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const other = await call<AuthResponse>('POST', '/auth/login', undefined, { username: 'founder', password: 'correct horse battery' });
    const wrong = await call('POST', '/me/password', founder.token, { currentPassword: 'nope', newPassword: 'a new long password' });
    expect(wrong.status).toBe(400);
    const changed = await call('POST', '/me/password', founder.token, { currentPassword: 'correct horse battery', newPassword: 'a new long password' });
    expect(changed.status).toBe(204);
    expect((await call('GET', '/me', founder.token)).status).toBe(200);
    expect((await call('GET', '/me', other.body.token)).status).toBe(401);
    expect((await call('POST', '/auth/login', undefined, { username: 'founder', password: 'a new long password' })).status).toBe(200);
  });

  it('exports only your own data, without the password hash', async () => {
    const { founder, friend } = await crew();
    await sync(founder.token, 0, [logged('mine', [entry('Curl', 10)])]);
    await sync(friend.token, 0, [logged('theirs', [entry('Curl', 99)])]);
    const result = await call<{ loggedWorkouts: { id: string }[] }>('GET', '/me/export', founder.token);
    expect(result.body.loggedWorkouts.map((row) => row.id)).toEqual(['mine']);
    expect(JSON.stringify(result.body)).not.toContain('argon2');
  });
});

describe('overtaking', () => {
  it('tells a friend you passed them, once a day', async () => {
    const { founder, friend } = await crew();
    await sync(friend.token, 0, [logged('f1', [entry('Curl', 10)])]);
    // Only one workout a day counts, so passing someone today takes progress on an older number.
    const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    await sync(founder.token, 0, [logged('m1', [entry('Curl', 10)], { date: twoWeeksAgo })]);
    // Written at the time, not backdated from today, or it couldn't be a baseline.
    await db.update(schema.loggedWorkouts).set({ recordedAt: new Date(`${twoWeeksAgo}T12:00:00Z`) }).where(eq(schema.loggedWorkouts.id, 'm1'));
    await sync(founder.token, 0, [logged('m2', [entry('Curl', 11)])]);
    await sync(founder.token, 0, [logged('m3', [entry('Press', 10)])]);
    const notes = await call<NotificationView[]>('GET', '/notifications', friend.token);
    expect(notes.body.filter((note) => note.title === 'Overtaken')).toHaveLength(1);
  });

  it('doesn’t count passing someone on zero', async () => {
    const { founder, friend } = await crew();
    await sync(founder.token, 0, [logged('m1', [entry('Curl', 10)])]);
    const notes = await call<NotificationView[]>('GET', '/notifications', friend.token);
    expect(notes.body.filter((note) => note.title === 'Overtaken')).toHaveLength(0);
  });
});

describe('streaks and trophies', () => {
  it('awards once, keeps it, and bundles the notification', async () => {
    const founder = await register('founder', BOOTSTRAP);
    await sync(founder.token, 0, [logged('a', [entry('Curl', 10)]), logged('b', [entry('Curl', 10)]), logged('c', [entry('Curl', 10)])]);
    const trophies = await call<TrophyView[]>('GET', '/trophies', founder.token);
    expect(trophies.body.find((trophy) => trophy.id === 'showed_up')?.earnedAt).not.toBeNull();
    expect(trophies.body.find((trophy) => trophy.id === 'crew_leader')?.earnedAt).toBeNull();
    await sync(founder.token, 0, [logged('a', [entry('Curl', 10)], { deleted: true, updatedAt: Date.now() + 5000 })]);
    const again = await call<TrophyView[]>('GET', '/trophies', founder.token);
    expect(again.body.find((trophy) => trophy.id === 'showed_up')?.earnedAt).not.toBeNull();
    const notes = await call<NotificationView[]>('GET', '/notifications', founder.token);
    expect(notes.body.filter((note) => note.title === 'Trophy unlocked')).toHaveLength(1);
  });

  it('starts a new goal next Monday once you’ve logged something', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const first = await call<Me>('PATCH', '/me', founder.token, { weeklyTarget: 2 });
    expect(first.body).toMatchObject({ weeklyTarget: 2, goalHistory: [] });
    await sync(founder.token, 0, [logged('a', [entry('Curl', 10)])]);
    const second = await call<Me>('PATCH', '/me', founder.token, { weeklyTarget: 5 });
    expect(second.body.weeklyTarget).toBe(5);
    expect(second.body.goalHistory).toHaveLength(2);
    expect(second.body.goalHistory[0]?.goal).toBe(2);
    const from = second.body.goalHistory[1]!;
    expect(from.goal).toBe(5);
    expect(new Date(`${from.from}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(from.from > new Date().toISOString().slice(0, 10)).toBe(true);
    // Changing your mind before Monday replaces it rather than stacking up.
    const third = await call<Me>('PATCH', '/me', founder.token, { weeklyTarget: 4 });
    expect(third.body.goalHistory).toEqual([second.body.goalHistory[0], { from: from.from, goal: 4 }]);
  });

  it('remembers your time zone, and refuses a made-up one', async () => {
    const founder = await register('founder', BOOTSTRAP);
    expect((await call<Me>('PATCH', '/me', founder.token, { timeZone: 'Asia/Riyadh' })).body.timeZone).toBe('Asia/Riyadh');
    expect((await call('PATCH', '/me', founder.token, { timeZone: 'Mars/Olympus' })).status).toBe(400);
  });

  it('counts a call on the week it landed in where you live', async () => {
    const { founder, friend } = await crew();
    const zone = 'Pacific/Kiritimati';
    await call('PATCH', '/me', friend.token, { timeZone: zone });
    const created = await post(friend.token, { entries: [entry('Row', 90)] });
    await call('POST', `/posts/${created.body.id}/calls`, founder.token, { exercise: 'Row', line: 'Hm.' });
    await sync(friend.token, 0, [logged('w', [entry('Row', 200)], { updatedAt: Date.now() + 1000 })]);
    // Kiritimati is 14 hours ahead, so its Monday starts on Sunday morning in UTC.
    const monday = Date.parse(`${mondayOf(dateIn(zone))}T00:00:00Z`) - 14 * 3_600_000;
    const scoreIf = async (resolvedAt: number) => {
      await db.update(schema.sandbagCalls).set({ resolvedAt: new Date(resolvedAt) });
      const rows = (await call<RankingRow[]>('GET', '/rankings?period=week', friend.token)).body;
      return rows.find((row) => row.user.id === friend.user.id)!.score;
    };
    expect(await scoreIf(monday + 1800_000)).toBeGreaterThan(await scoreIf(monday - 1800_000));
  });

  it('tells you at sign-up what’s wrong before the last step', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const check = async (body: object) => (await call<SignUpCheck>('POST', '/auth/check', undefined, body)).body;
    expect(await check({ inviteCode: founder.user.inviteCode.toLowerCase() })).toEqual({ inviteCode: true });
    expect(await check({ inviteCode: 'NOPENOPE' })).toEqual({ inviteCode: false });
    expect(await check({ inviteCode: BOOTSTRAP })).toEqual({ inviteCode: false });
    expect(await check({ username: 'founder' })).toEqual({ username: false });
    expect(await check({ username: 'someone_new' })).toEqual({ username: true });
  });

  it('accepts the first invite code before anyone has signed up', async () => {
    expect((await call<SignUpCheck>('POST', '/auth/check', undefined, { inviteCode: BOOTSTRAP })).body).toEqual({ inviteCode: true });
  });

  it('puts the streak in the rankings', async () => {
    const founder = await register('founder', BOOTSTRAP);
    await call('PATCH', '/me', founder.token, { weeklyTarget: 2 });
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const sameWeek = new Date(`${today}T00:00:00Z`).getUTCDay() === 0 ? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) : tomorrow;
    await sync(founder.token, 0, [logged('a', [entry('Curl', 10)]), logged('b', [entry('Curl', 10)], { date: sameWeek })]);
    const rows = await call<RankingRow[]>('GET', '/rankings?period=week', founder.token);
    expect(rows.body[0]?.streak).toBe(1);
  });
});

describe('public API', () => {
  const PASSWORD = 'correct horse battery';
  const makeKey = async (token: string) =>
    (await call<ApiKeyView & { key: string }>('POST', '/me/api-keys', token, { name: 'Import', password: PASSWORD })).body;

  it('needs your password to make a key, and shows it only once', async () => {
    const founder = await register('founder', BOOTSTRAP);
    expect((await call('POST', '/me/api-keys', founder.token, { name: 'x', password: 'wrong' })).status).toBe(400);
    const key = await makeKey(founder.token);
    expect(key.key).toMatch(/^sbk_/);
    const list = await call<ApiKeyView[]>('GET', '/me/api-keys', founder.token);
    expect(JSON.stringify(list.body)).not.toContain(key.key);
  });

  it('imports workouts that reach the app on its next sync, and rerunning replaces them', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const { key } = await makeKey(founder.token);
    const body = { workouts: [{ id: 'import-1', date: '2026-01-15', title: 'Old session', entries: [{ name: 'Cable curls', sets: 3, reps: 8, weight: 11.3, rpe: 8, note: 'last set 13.6' }, { name: 'Rope', kind: 'time', minutes: 5 }, { name: 'Name only' }] }] };
    const first = await call<{ created: number; updated: number }>('POST', '/v1/workouts', key, body);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: 1, updated: 0 });
    expect((await call<{ created: number; updated: number }>('POST', '/v1/workouts', key, body)).body).toMatchObject({ created: 0, updated: 1 });
    const pulled = await sync(founder.token, 0);
    expect(pulled.body.loggedWorkouts).toHaveLength(1);
    expect(pulled.body.loggedWorkouts[0]?.entries[2]).toMatchObject({ name: 'Name only', kind: 'strength', weight: null, note: '' });
    const listed = await call<{ workouts: { id: string }[]; nextCursor: number | null }>('GET', '/v1/workouts', key);
    expect(listed.body.workouts.map((workout) => workout.id)).toEqual(['import-1']);
    expect((await call('DELETE', '/v1/workouts/import-1', key)).status).toBe(204);
    expect((await call<{ workouts: unknown[] }>('GET', '/v1/workouts', key)).body.workouts).toHaveLength(0);
    expect((await call('DELETE', '/v1/workouts/import-1', key)).status).toBe(404);
  });

  it('names the bad field and refuses future dates', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const { key } = await makeKey(founder.token);
    const bad = await call<{ error: string }>('POST', '/v1/workouts', key, { workouts: [{ date: '2026-01-15', entries: [{ name: 'Curl', rpe: 50 }] }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('workouts.0.entries.0.rpe');
    const future = await call('POST', '/v1/workouts', key, { workouts: [{ date: '2099-01-01', entries: [{ name: 'Curl' }] }] });
    expect(future.status).toBe(400);
  });

  it('keeps keys to /v1 and to their owner, and sessions out of /v1', async () => {
    const { founder, friend } = await crew();
    const { key } = await makeKey(founder.token);
    expect((await call('GET', '/me', key)).status).toBe(401);
    expect((await call('DELETE', '/me', key, { password: 'correct horse battery' })).status).toBe(401);
    expect((await call('GET', '/v1/me', founder.token)).status).toBe(401);
    await call('POST', '/v1/workouts', key, { workouts: [{ id: 'mine', date: '2026-01-15', entries: [{ name: 'Curl' }] }] });
    const other = await makeKey(friend.token);
    expect((await call('DELETE', '/v1/workouts/mine', other.key)).status).toBe(404);
    expect((await call<{ workouts: unknown[] }>('GET', '/v1/workouts', other.key)).body.workouts).toHaveLength(0);
  });

  it('stops working once deleted, or after a password change', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const one = await makeKey(founder.token);
    const two = await makeKey(founder.token);
    expect((await call('DELETE', `/me/api-keys/${one.id}`, founder.token)).status).toBe(204);
    expect((await call('GET', '/v1/me', one.key)).status).toBe(401);
    await call('POST', '/me/password', founder.token, { currentPassword: PASSWORD, newPassword: 'a new long password' });
    expect((await call('GET', '/v1/me', two.key)).status).toBe(401);
  });

  it('doesn’t let a backdated import answer a sandbag call', async () => {
    const { founder, friend } = await crew();
    const created = await post(founder.token);
    await call('POST', `/posts/${created.body.id}/calls`, friend.token, { exercise: 'Lat pulldown', line: 'Hm.' });
    const { key } = await makeKey(founder.token);
    await call('POST', '/v1/workouts', key, { workouts: [{ date: '2026-01-15', entries: [{ name: 'Lat pulldown', weight: 500 }] }] });
    const calls = await call<CallView[]>('GET', '/calls', founder.token);
    expect(calls.body[0]?.status).toBe('open');
  });

  it('leaves a sandbag call open for a backfilled session, then settles it on the next real one', async () => {
    const { founder, friend } = await crew();
    const created = await post(founder.token);
    await call('POST', `/posts/${created.body.id}/calls`, friend.token, { exercise: 'Lat pulldown', line: 'Hm.' });
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    await sync(founder.token, 0, [logged('forgotten', [entry('Lat pulldown', 200)], { date: threeDaysAgo })]);
    expect((await call<CallView[]>('GET', '/calls', founder.token)).body[0]?.status).toBe('open');
    await sync(founder.token, 0, [logged('today', [entry('Lat pulldown', 200)])]);
    expect((await call<CallView[]>('GET', '/calls', founder.token)).body[0]?.status).toBe('cleared');
  });

  it('saves workouts through the API', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const { key } = await makeKey(founder.token);
    const saved = await call<{ id: string; position: number }>('POST', '/v1/saved-workouts', key, { name: 'Upper', exercises: [{ name: 'Curl', sets: 3, reps: 8 }] });
    expect(saved.body.position).toBe(0);
    expect((await sync(founder.token, 0)).body.savedWorkouts).toHaveLength(1);
    expect((await call('DELETE', `/v1/saved-workouts/${saved.body.id}`, key)).status).toBe(204);
  });
});

describe('web sessions', () => {
  const PASSWORD = 'correct horse battery';
  const WEB = { 'x-sandbag-web': '1' };
  const signUpOnWeb = async () => {
    const response = await app.inject({
      method: 'POST', url: '/auth/register', headers: WEB,
      payload: { username: 'founder', displayName: 'Founder', password: PASSWORD, inviteCode: BOOTSTRAP },
    });
    const header = String(response.headers['set-cookie']);
    return { response, header, cookie: header.split(';')[0]! };
  };

  it('keeps the session out of reach of page scripts', async () => {
    const { response, header } = await signUpOnWeb();
    expect(response.statusCode).toBe(201);
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/Secure/);
    expect(header).toMatch(/SameSite=Strict/);
    expect((JSON.parse(response.body) as AuthResponse).token).toBe('');
  });

  it('gives phones a token and no cookie', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'founder', displayName: 'Founder', password: PASSWORD, inviteCode: BOOTSTRAP } });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect((JSON.parse(response.body) as AuthResponse).token).not.toBe('');
  });

  it('reads with the cookie alone, but changes need the header other sites can’t send', async () => {
    const { cookie } = await signUpOnWeb();
    expect((await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode).toBe(200);
    const change = { method: 'PATCH', url: '/me', payload: { displayName: 'Changed' } } as const;
    expect((await app.inject({ ...change, headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ ...change, headers: { cookie, ...WEB } })).statusCode).toBe(200);
  });

  it('can’t reach the public API, keeps itself on password change, and ends on sign out', async () => {
    const { cookie } = await signUpOnWeb();
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } })).statusCode).toBe(401);
    const changed = await app.inject({ method: 'POST', url: '/me/password', headers: { cookie, ...WEB }, payload: { currentPassword: PASSWORD, newPassword: 'a new long password' } });
    expect(changed.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode).toBe(200);
    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie, ...WEB } });
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode).toBe(401);
  });
});

describe('staying signed in', () => {
  const { authSessions } = schema;
  const expiry = async (userId: string) => (await db.select().from(authSessions).where(eq(authSessions.userId, userId)))[0]!.expiresAt.getTime();

  it('renews the 90 days whenever the app is used', async () => {
    const founder = await register('founder', BOOTSTRAP);
    await db.update(authSessions).set({ expiresAt: new Date(Date.now() + 10 * 86_400_000) }).where(eq(authSessions.userId, founder.user.id));
    expect((await call('GET', '/me', founder.token)).status).toBe(200);
    expect(await expiry(founder.user.id)).toBeGreaterThan(Date.now() + 89 * 86_400_000);
  });

  it('doesn’t bring back a session that already ran out', async () => {
    const founder = await register('founder', BOOTSTRAP);
    await db.update(authSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authSessions.userId, founder.user.id));
    expect((await call('GET', '/me', founder.token)).status).toBe(401);
    expect(await expiry(founder.user.id)).toBeLessThan(Date.now());
  });
});

describe('push', () => {
  const TOKEN = 'fcm-token-long-enough-for-the-schema';
  const fake = (result: { dead?: string[]; retry?: boolean } = {}) => {
    const sent: { tokens: string[]; message: PushMessage }[] = [];
    return { sent, sender: { send: async (tokens: string[], message: PushMessage) => { sent.push({ tokens, message }); return { dead: result.dead ?? [], retry: result.retry ?? false }; } } };
  };
  const pending = () => deliverPending(db as unknown as Db, sender.sender);
  let sender = fake();
  beforeEach(() => { sender = fake(); });

  // Joining sends the inviter a notification, which is the simplest real one to push.
  const inviterWithToken = async () => {
    const founder = await register('founder', BOOTSTRAP);
    expect((await call('PUT', '/me/push-token', founder.token, { token: TOKEN })).status).toBe(204);
    return founder;
  };

  it('sends a notification once, to the right phone', async () => {
    const founder = await inviterWithToken();
    await register('friend', founder.user.inviteCode);
    expect(await pending()).toBe(1);
    expect(sender.sent[0]?.tokens).toEqual([TOKEN]);
    expect(sender.sent[0]?.message).toMatchObject({ title: 'New recruit', route: 'invites' });
    expect(await pending()).toBe(0);
    expect(sender.sent).toHaveLength(1);
  });

  it('stops when you sign out, or change your password elsewhere', async () => {
    const founder = await inviterWithToken();
    await call('POST', '/auth/logout', founder.token);
    await register('friend', founder.user.inviteCode);
    await pending();
    expect(sender.sent).toHaveLength(0);
    expect(await db.select().from(schema.pushTokens)).toHaveLength(0);
  });

  it('forgets a phone Firebase says is gone', async () => {
    const founder = await inviterWithToken();
    await register('friend', founder.user.inviteCode);
    await deliverPending(db as unknown as Db, fake({ dead: [TOKEN] }).sender);
    expect(await db.select().from(schema.pushTokens)).toHaveLength(0);
  });

  it('tries again after a failure, but not with old news', async () => {
    const founder = await inviterWithToken();
    await register('friend', founder.user.inviteCode);
    expect(await deliverPending(db as unknown as Db, fake({ retry: true }).sender)).toBe(0);
    await db.update(schema.notifications).set({ createdAt: new Date(Date.now() - 2 * 3_600_000) });
    expect(await pending()).toBe(0);
    expect(sender.sent).toHaveLength(0);
    expect((await db.select().from(schema.notifications))[0]?.pushedAt).not.toBeNull();
  });

  it('moves a shared phone’s token to whoever signed in last', async () => {
    const founder = await inviterWithToken();
    const friend = await register('friend', founder.user.inviteCode);
    await call('PUT', '/me/push-token', friend.token, { token: TOKEN });
    const [row] = await db.select().from(schema.pushTokens);
    expect(row?.userId).toBe(friend.user.id);
  });

  it('can’t be reached with an API key', async () => {
    const founder = await register('founder', BOOTSTRAP);
    const key = await call<{ key: string }>('POST', '/me/api-keys', founder.token, { name: 'x', password: 'correct horse battery' });
    expect((await call('PUT', '/me/push-token', key.body.key, { token: TOKEN })).status).toBe(401);
  });
});

