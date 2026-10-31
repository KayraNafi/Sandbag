import { PGlite } from '@electric-sql/pglite';
import type { ApiKeyView, AuthResponse, CallView, NotificationView, TrophyView, Entry, InviteSummary, LoggedWorkout, PostView, RankingRow, SyncResponse } from '@sandbag/shared';
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
    await post(founder.token, { showWeights: false, entries: [entry('Lat pulldown', 86, { note: 'secret' })] });
    const [seen] = (await call<PostView[]>('GET', '/feed', friend.token)).body;
    expect(seen?.entries[0]?.weight).toBeNull();
    expect(seen?.entries[0]?.note).toBe('');
    const [own] = (await call<PostView[]>('GET', '/feed', founder.token)).body;
    expect(own?.entries[0]?.weight).toBe(86);
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
    await sync(founder.token, 0, [logged('m1', [entry('Curl', 10)]), logged('m2', [entry('Row', 10)])]);
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

  it('puts the streak in the rankings', async () => {
    const founder = await register('founder', BOOTSTRAP);
    await sync(founder.token, 0, [logged('a', [entry('Curl', 10)]), logged('b', [entry('Curl', 10)]), logged('c', [entry('Curl', 10)])]);
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

