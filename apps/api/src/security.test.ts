import { PGlite } from '@electric-sql/pglite';
import type { ApiKeyView, AuthResponse, CallView, NotificationView, PostView, SyncResponse } from '@sandbag/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { Db } from './db/client';
import * as schema from './db/schema';

// Each test attacks a fresh server the way an outsider, a stranger with an account,
// or a friend overstepping would. Setup calls get their own address, so only an
// attack that means to hit a rate limit ever does.
const BOOTSTRAP = 'founder-invite-code-long-enough';
const PASSWORD = 'correct horse battery';
// A weight nothing else in these tests uses, so finding it anywhere means a leak.
const SECRET_WEIGHT = 777.5;

let app: FastifyInstance;
let db: ReturnType<typeof drizzle<typeof schema>>;
let setupAddress = 0;

beforeEach(async () => {
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
  app = await buildApp(db as unknown as Db, { bootstrapInviteCode: BOOTSTRAP });
});

interface Options { token?: string; body?: unknown; ip?: string; headers?: Record<string, string> }

async function call<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, options: Options = {}) {
  setupAddress += 1;
  const response = await app.inject({
    method, url,
    remoteAddress: options.ip ?? `10.${(setupAddress >> 16) & 255}.${(setupAddress >> 8) & 255}.${setupAddress & 255}`,
    headers: { ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...options.headers },
    ...(options.body === undefined ? {} : { payload: options.body as object }),
  });
  let body: T;
  try { body = JSON.parse(response.body) as T; } catch { body = undefined as T; }
  return { status: response.statusCode, body, raw: response.body };
}

const signUp = async (username: string, inviteCode: string) => {
  const result = await call<AuthResponse>('POST', '/auth/register', { body: { username, displayName: username, password: PASSWORD, inviteCode } });
  expect(result.status).toBe(201);
  return result.body;
};

const makeKey = async (token: string) => (await call<ApiKeyView & { key: string }>('POST', '/me/api-keys', { token, body: { name: 'k', password: PASSWORD } })).body.key;

/** alice and bob are friends, as are alice and carol. mallory has an account but knows none of them. */
async function world() {
  const founder = await signUp('founder', BOOTSTRAP);
  const alice = await signUp('alice', founder.user.inviteCode);
  const bob = await signUp('bob', alice.user.inviteCode);
  const carol = await signUp('carol', alice.user.inviteCode);
  const mallory = await signUp('mallory', founder.user.inviteCode);
  // Joining puts her in the whole crew, so she leaves it: a stranger with an account.
  const crew = await call<{ id: string }[]>('GET', '/friends', { token: mallory.token });
  for (const friend of crew.body) await call('DELETE', `/friends/${friend.id}`, { token: mallory.token });
  return { founder, alice, bob, carol, mallory };
}

const entry = (name = 'Bench press', weight: number | null = SECRET_WEIGHT) => ({
  id: randomUUID(), name, kind: 'strength', sets: 3, reps: 8, weight, perSide: false, rpe: 8, minutes: null, note: `secret note ${SECRET_WEIGHT}`,
});

const post = async (token: string, extra: { showWeights?: boolean; recipientIds?: string[]; kind?: string } = {}) => {
  const result = await call<PostView>('POST', '/posts', {
    token,
    body: { id: randomUUID(), kind: extra.kind ?? 'workout', title: 'Session', caption: 'x', showWeights: extra.showWeights ?? true, entries: [entry()], recipientIds: extra.recipientIds ?? [] },
  });
  expect(result.status).toBe(201);
  return result.body;
};

const logged = (id: string, title = 'Mine') => ({ id, date: '2026-01-15', title, savedWorkoutId: null, entries: [entry()], updatedAt: Date.now(), deleted: false });
const sync = (token: string, loggedWorkouts: unknown[] = [], savedWorkouts: unknown[] = []) =>
  call<SyncResponse>('POST', '/sync', { token, body: { cursor: 0, loggedWorkouts, savedWorkouts } });
const userCount = async () => (await db.select().from(schema.users)).length;

describe('getting in without an invite', () => {
  it('refuses every wrong code, however it’s dressed up', async () => {
    await signUp('founder', BOOTSTRAP);
    const before = await userCount();
    const codes: unknown[] = ['', ' ', 'WRONGCODE', "' OR '1'='1", "x'; DROP TABLE users; --", '%', '_', 'null', null, 0, true, [], {}, ['A'], { $ne: '' }];
    for (const inviteCode of codes) {
      const { status } = await call('POST', '/auth/register', { body: { username: 'intruder', displayName: 'x', password: PASSWORD, inviteCode } });
      expect(status, JSON.stringify(inviteCode)).toBe(400);
    }
    expect((await call('POST', '/auth/register', { body: { username: 'intruder', displayName: 'x', password: PASSWORD } })).status).toBe(400);
    expect(await userCount()).toBe(before);
  });

  it('retires the bootstrap code after the first account', async () => {
    await signUp('founder', BOOTSTRAP);
    for (const inviteCode of [BOOTSTRAP, BOOTSTRAP.toUpperCase(), BOOTSTRAP.toLowerCase()]) {
      expect((await call('POST', '/auth/register', { body: { username: 'second', displayName: 'x', password: PASSWORD, inviteCode } })).status).toBe(400);
    }
    expect(await userCount()).toBe(1);
  });

  it('can’t use an extra field to pick an inviter or a role', async () => {
    const { founder } = await world();
    const { status } = await call('POST', '/auth/register', { body: { username: 'sneak', displayName: 'x', password: PASSWORD, inviteCode: 'WRONGCODE', invitedBy: founder.user.id, isAdmin: true } });
    expect(status).toBe(400);
  });

  it('needs a real session for everything private', async () => {
    const id = randomUUID();
    const routes: ['GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', string][] = [
      ['GET', '/me'], ['PATCH', '/me'], ['DELETE', '/me'], ['POST', '/me/password'], ['GET', '/me/export'],
      ['GET', '/me/api-keys'], ['POST', '/me/api-keys'], ['DELETE', `/me/api-keys/${id}`], ['PUT', '/me/push-token'], ['PUT', '/me/web-push'], ['GET', '/push/web-key'],
      ['POST', '/sync'], ['GET', '/feed'], ['POST', '/posts'], ['GET', `/posts/${id}`], ['DELETE', `/posts/${id}`],
      ['PUT', `/posts/${id}/respect`], ['DELETE', `/posts/${id}/respect`], ['POST', `/posts/${id}/replies`], ['POST', `/posts/${id}/save`], ['POST', `/posts/${id}/calls`],
      ['GET', '/calls'], ['GET', '/rankings'], ['GET', '/friends'], ['POST', '/friends'], ['DELETE', `/friends/${id}`], ['GET', '/invites'],
      ['GET', '/notifications'], ['POST', '/notifications/read'], ['GET', '/trophies'],
      ['GET', '/v1/me'], ['GET', '/v1/workouts'], ['POST', '/v1/workouts'], ['DELETE', `/v1/workouts/${id}`], ['GET', '/v1/saved-workouts'], ['POST', '/v1/saved-workouts'], ['DELETE', `/v1/saved-workouts/${id}`],
    ];
    const founder = await signUp('founder', BOOTSTRAP);
    await db.update(schema.authSessions).set({ expiresAt: new Date(Date.now() - 1000) });
    for (const [method, url] of routes) {
      const label = `${method} ${url}`;
      for (const token of [undefined, 'garbage', 'sbk_garbage', founder.token]) {
        expect((await call(method, url, token ? { token, body: {} } : { body: {} })).status, `${label} with ${token?.slice(0, 8)}`).toBe(401);
      }
    }
  });
});

describe('seeing or changing someone else’s data', () => {
  it('keeps a stranger out of a post, in every way of touching it', async () => {
    const { alice, mallory } = await world();
    const share = await post(alice.token, { kind: 'share' });
    const token = mallory.token;
    expect((await call('GET', `/posts/${share.id}`, { token })).status).toBe(404);
    expect((await call('PUT', `/posts/${share.id}/respect`, { token })).status).toBe(404);
    expect((await call('POST', `/posts/${share.id}/replies`, { token, body: { text: 'hi' } })).status).toBe(404);
    expect((await call('POST', `/posts/${share.id}/save`, { token })).status).toBe(404);
    expect((await call('POST', `/posts/${share.id}/calls`, { token, body: { exercise: 'Bench press', line: 'x' } })).status).toBe(404);
    expect((await call('DELETE', `/posts/${share.id}`, { token })).status).toBe(404);
    expect((await call<PostView[]>('GET', '/feed', { token })).raw).not.toContain(share.id);
    expect((await call('GET', `/posts/${share.id}`, { token: alice.token })).status).toBe(200);
  });

  it('keeps a private post from friends it wasn’t sent to', async () => {
    const { alice, bob, carol } = await world();
    const secret = await post(alice.token, { recipientIds: [bob.user.id] });
    expect((await call('GET', `/posts/${secret.id}`, { token: bob.token })).status).toBe(200);
    expect((await call('GET', `/posts/${secret.id}`, { token: carol.token })).status).toBe(404);
    expect((await call('GET', '/feed', { token: carol.token })).raw).not.toContain(secret.id);
    expect((await call('POST', `/posts/${secret.id}/replies`, { token: carol.token, body: { text: 'hi' } })).status).toBe(404);
  });

  it('won’t let you aim a post into a stranger’s feed', async () => {
    const { alice, mallory } = await world();
    const { status } = await call('POST', '/posts', { token: mallory.token, body: { id: randomUUID(), kind: 'workout', title: 'Spam', caption: '', showWeights: true, entries: [entry()], recipientIds: [alice.user.id] } });
    expect(status).toBe(400);
  });

  it('won’t let a friend delete your post, or steal its id', async () => {
    const { alice, bob, mallory } = await world();
    const mine = await post(alice.token);
    expect((await call('DELETE', `/posts/${mine.id}`, { token: bob.token })).status).toBe(403);
    const stolen = await call('POST', '/posts', { token: mallory.token, body: { id: mine.id, kind: 'workout', title: 'Mine now', caption: '', showWeights: true, entries: [entry()], recipientIds: [] } });
    expect(stolen.status).toBe(409);
    expect(stolen.raw).not.toContain('Session');
    expect((await call<PostView>('GET', `/posts/${mine.id}`, { token: alice.token })).body.title).toBe('Session');
  });

  it('stops access when a friendship ends', async () => {
    const { alice, bob } = await world();
    const mine = await post(alice.token);
    expect((await call('DELETE', `/friends/${alice.user.id}`, { token: bob.token })).status).toBe(204);
    expect((await call('GET', `/posts/${mine.id}`, { token: bob.token })).status).toBe(404);
  });

  it('keeps workouts apart even when two people use the same id', async () => {
    const { alice, mallory } = await world();
    await sync(alice.token, [logged('shared-id', 'Alice’s')], [{ id: 'saved-id', name: 'Alice’s', position: 0, exercises: [], savedFrom: null, updatedAt: Date.now(), deleted: false }]);
    const attack = await sync(mallory.token, [{ ...logged('shared-id', 'Overwritten'), updatedAt: Date.now() + 5000 }], [{ id: 'saved-id', name: 'Overwritten', position: 0, exercises: [], savedFrom: null, updatedAt: Date.now() + 5000, deleted: false }]);
    expect(attack.raw).not.toContain('Alice’s');
    const pulled = await sync(alice.token);
    expect(pulled.body.loggedWorkouts[0]?.title).toBe('Alice’s');
    expect(pulled.body.savedWorkouts[0]?.name).toBe('Alice’s');
    expect((await sync(mallory.token)).raw).not.toContain('Alice’s');
  });

  it('can’t claim someone else’s data by adding fields', async () => {
    const { alice, mallory } = await world();
    await sync(mallory.token, [{ ...logged('planted'), ownerId: alice.user.id, owner_id: alice.user.id, seq: 1 }]);
    expect((await sync(alice.token)).raw).not.toContain('planted');
    const patched = await call('PATCH', '/me', { token: mallory.token, body: { username: 'alice', inviteCode: 'MINE', passwordHash: 'x', id: alice.user.id, sandbagUntil: null, invitedBy: alice.user.id, displayName: 'M' } });
    expect(patched.status).toBe(200);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, mallory.user.id));
    expect(row).toMatchObject({ username: 'mallory', invitedBy: expect.not.stringContaining(alice.user.id) });
    expect(row?.passwordHash).not.toBe('x');
    expect(row?.inviteCode).not.toBe('MINE');
  });

  it('keeps API keys to their owner', async () => {
    const { alice, mallory } = await world();
    const key = await makeKey(alice.token);
    await sync(alice.token, [logged('alices')]);
    const [row] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, alice.user.id));
    expect((await call('DELETE', `/me/api-keys/${row!.id}`, { token: mallory.token })).status).toBe(204);
    expect((await call('GET', '/v1/me', { token: key })).status).toBe(200);
    expect((await call('GET', '/me/api-keys', { token: mallory.token })).raw).not.toContain(row!.id);
    const theirs = await makeKey(mallory.token);
    expect((await call('GET', '/v1/workouts', { token: theirs })).raw).not.toContain('alices');
    expect((await call('DELETE', '/v1/workouts/alices', { token: theirs })).status).toBe(404);
    expect((await call('POST', '/v1/saved-workouts', { token: theirs, body: { id: 'x1', name: 'n', exercises: [] } })).status).toBe(201);
    expect((await call('DELETE', '/v1/saved-workouts/x1', { token: key })).status).toBe(404);
    expect((await call('GET', '/me/api-keys', { token: key })).status).toBe(401);
    expect((await call('POST', '/sync', { token: key, body: { cursor: 0, loggedWorkouts: [], savedWorkouts: [] } })).status).toBe(401);
  });

  it('never shows you another person’s notifications, calls or export', async () => {
    const { alice, bob, mallory } = await world();
    const mine = await post(alice.token);
    await call('POST', `/posts/${mine.id}/replies`, { token: bob.token, body: { text: 'private reply' } });
    await sync(alice.token, [logged('alices-log')]);
    expect((await call('GET', '/notifications', { token: mallory.token })).raw).not.toContain('private reply');
    await call('POST', '/notifications/read', { token: mallory.token });
    const notes = await call<NotificationView[]>('GET', '/notifications', { token: alice.token });
    expect(notes.body.find((note) => note.body === 'private reply')?.read).toBe(false);
    expect((await call('GET', '/me/export', { token: mallory.token })).raw).not.toContain('alices-log');
    expect((await call('GET', '/calls', { token: mallory.token })).body).toEqual([]);
    expect((await call('GET', '/rankings', { token: mallory.token })).raw).not.toContain(alice.user.id);
    expect((await call('GET', '/friends', { token: mallory.token })).raw).not.toContain(alice.user.id);
    expect((await call('GET', '/invites', { token: mallory.token })).raw).not.toContain(alice.user.id);
  });

  it('keeps hidden weights hidden everywhere a friend can look', async () => {
    const { alice, bob } = await world();
    await sync(alice.token, [logged('alices-log')]);
    const hidden = await post(alice.token, { showWeights: false, kind: 'share' });
    expect((await call('POST', `/posts/${hidden.id}/calls`, { token: bob.token, body: { exercise: 'Bench press', line: 'Hm.' } })).status).toBe(201);
    const saved = await call('POST', `/posts/${hidden.id}/save`, { token: bob.token });
    const places = [saved.raw];
    for (const url of ['/feed', `/posts/${hidden.id}`, '/calls', '/notifications', '/rankings', '/rankings?period=month', '/friends', '/invites', '/trophies', '/me/export']) {
      places.push((await call('GET', url, { token: bob.token })).raw);
    }
    // Failing the call shows what a verdict tells the caller, too.
    await sync(alice.token, [{ ...logged('answer'), date: new Date().toISOString().slice(0, 10), entries: [entry('Bench press', 1)], updatedAt: Date.now() + 2000 }]);
    places.push((await call('GET', '/notifications', { token: bob.token })).raw, (await call('GET', '/calls', { token: bob.token })).raw);
    for (const text of places) {
      expect(text).not.toContain(String(SECRET_WEIGHT));
      expect(text).not.toContain('secret note');
    }
    expect((await call<CallView[]>('GET', '/calls', { token: bob.token })).body[0]?.targetWeight).toBeNull();
  });

  it('never returns password hashes, session data, or other people’s invite codes', async () => {
    const { alice, bob } = await world();
    const mine = await post(alice.token);
    await call('POST', `/posts/${mine.id}/replies`, { token: alice.token, body: { text: 'x' } });
    for (const url of ['/feed', `/posts/${mine.id}`, '/rankings', '/friends', '/invites', '/calls', '/notifications']) {
      const { raw } = await call('GET', url, { token: bob.token });
      expect(raw, url).not.toContain(alice.user.inviteCode);
      expect(raw, url).not.toMatch(/passwordHash|password_hash|\$argon2|tokenHash|sandbag_session/);
    }
    expect((await call('GET', '/me/export', { token: alice.token })).raw).not.toMatch(/passwordHash|\$argon2/);
  });
});

describe('guessing passwords', () => {
  // The per-account throttle lives for the whole process, so no two tests may share a name.
  let unique = 0;
  const fresh = (prefix: string) => `${prefix}_${(unique += 1)}_${Date.now() % 100000}`;
  const attempt = (username: string, password: string, ip: string) => call('POST', '/auth/login', { ip, body: { username, password } });

  it('slows one address down', async () => {
    const name = fresh('ghost');
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await attempt(name, `wrong-${i}`, '203.0.113.5')).status);
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(10).every((status) => status === 429)).toBe(true);
  });

  it('stops a whole botnet guessing one account, under any spelling', async () => {
    const name = fresh('victim');
    await signUp(name, BOOTSTRAP);
    const statuses = [];
    for (let i = 0; i < 22; i += 1) statuses.push((await attempt(i % 2 ? name.toUpperCase() : ` ${name} `, `wrong-${i}`, `198.51.100.${i}`)).status);
    expect(statuses.slice(0, 20).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(20).every((status) => status === 429)).toBe(true);
  });

  it('can’t beat the limit by guessing all at once', async () => {
    const name = fresh('victim');
    await signUp(name, BOOTSTRAP);
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => attempt(name, `wrong-${i}`, `192.0.2.${i + 1}`)));
    expect(results.filter((result) => result.status === 401).length).toBeLessThanOrEqual(20);
  });

  it('counts a block of IPv6 addresses as one attacker', async () => {
    // Different names, so only the per-address limit can be what stops this.
    const statuses = [];
    for (let i = 1; i <= 12; i += 1) statuses.push((await attempt(fresh('ghost'), 'wrong-password', `2001:db8:1:1::${i.toString(16)}`)).status);
    expect(statuses.at(-1)).toBe(429);
    // Someone else entirely isn't affected.
    expect((await attempt(fresh('ghost'), 'wrong-password', '2001:db8:2:2::1')).status).toBe(401);
  });

  it('gives the same answer for a missing account and a wrong password', async () => {
    const name = fresh('victim');
    await signUp(name, BOOTSTRAP);
    const known = await attempt(name, 'wrong-password', '203.0.113.9');
    const unknown = await attempt(fresh('ghost'), 'wrong-password', '203.0.113.9');
    expect(known.status).toBe(401);
    expect(known.status).toBe(unknown.status);
    expect(known.raw).toBe(unknown.raw);
  });

  it('takes about as long for a missing account as a real one', async () => {
    const name = fresh('victim');
    await signUp(name, BOOTSTRAP);
    const ghost = fresh('ghost');
    const time = async (username: string, base: number) => {
      const started = performance.now();
      for (let i = 0; i < 4; i += 1) expect((await attempt(username, `wrong-${i}`, `203.0.${base}.${i}`)).status).toBe(401);
      return performance.now() - started;
    };
    // Warmed up first and taken in both orders, so startup costs don't look like a difference.
    await time(ghost, 9);
    const known = (await time(name, 10)) + (await time(name, 12));
    const unknown = (await time(ghost, 11)) + (await time(ghost, 13));
    expect(Math.max(known, unknown) / Math.min(known, unknown)).toBeLessThan(1.5);
  });

  it('limits guessing your password from a stolen session', async () => {
    const founder = await signUp('founder', BOOTSTRAP);
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await call('POST', '/me/password', { token: founder.token, ip: '203.0.113.20', body: { currentPassword: `wrong-${i}`, newPassword: 'a new long password' } })).status);
    expect(statuses.at(-1)).toBe(429);
    const keys = [];
    for (let i = 0; i < 12; i += 1) keys.push((await call('POST', '/me/api-keys', { token: founder.token, ip: '203.0.113.21', body: { name: 'x', password: `wrong-${i}` } })).status);
    expect(keys.at(-1)).toBe(429);
  });
});

describe('guessing invite codes', () => {
  it('limits guesses at sign-up', async () => {
    await signUp('founder', BOOTSTRAP);
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await call('POST', '/auth/register', { ip: '203.0.113.30', body: { username: `guess_${i}`, displayName: 'x', password: PASSWORD, inviteCode: `GUESS${i}` } })).status);
    expect(statuses.at(-1)).toBe(429);
  });

  it('limits guesses through add-a-friend', async () => {
    const { mallory } = await world();
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await call('POST', '/friends', { token: mallory.token, ip: '203.0.113.31', body: { inviteCode: `GUESS${i}` } })).status);
    expect(statuses.at(-1)).toBe(429);
  });

  it('makes codes too long and random to find by chance', async () => {
    const { alice, bob, carol, founder, mallory } = await world();
    const codes = [alice, bob, carol, founder, mallory].map((person) => person.user.inviteCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z0-9]{8,}$/);
  });
});

describe('bad input', () => {
  it('never crashes on odd ids or query strings', async () => {
    const { alice } = await world();
    const token = alice.token;
    const odd = ['1', '../../etc/passwd', "'; DROP TABLE users; --", '%00', '%27', 'a'.repeat(5000), '00000000-0000-0000-0000-000000000000'];
    for (const value of odd) {
      for (const [method, url] of [
        ['GET', `/posts/${value}`], ['DELETE', `/posts/${value}`], ['PUT', `/posts/${value}/respect`], ['DELETE', `/posts/${value}/respect`],
        ['DELETE', `/friends/${value}`], ['DELETE', `/me/api-keys/${value}`], ['GET', `/feed?before=${value}`], ['GET', `/rankings?period=${value}`],
      ] as const) {
        expect((await call(method, url, { token })).status, `${method} ${url.slice(0, 60)}`).toBeLessThan(500);
      }
    }
    const key = await makeKey(token);
    for (const value of odd) {
      for (const [method, url] of [
        ['DELETE', `/v1/workouts/${value}`], ['DELETE', `/v1/saved-workouts/${value}`], ['GET', `/v1/workouts?after=${value}`], ['GET', `/v1/workouts?limit=${value}`],
      ] as const) {
        expect((await call(method, url, { token: key })).status, `${method} ${url.slice(0, 60)}`).toBeLessThan(500);
      }
    }
  });

  it('rejects malformed bodies without leaking internals', async () => {
    const { alice } = await world();
    const response = await app.inject({ method: 'POST', url: '/sync', remoteAddress: '10.9.9.9', headers: { authorization: `Bearer ${alice.token}`, 'content-type': 'application/json' }, payload: '{"cursor":' });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toMatch(/node_modules|\/src\/|at .*:\d+:\d+/);
    for (const body of [{ cursor: -1 }, { cursor: 'x' }, { cursor: 0, loggedWorkouts: [{ id: '../x' }], savedWorkouts: [] }, { cursor: 1e308, loggedWorkouts: [], savedWorkouts: [] }]) {
      expect((await call('POST', '/sync', { token: alice.token, body })).status, JSON.stringify(body)).toBeLessThan(500);
    }
  });

  it('refuses a body over the size limit', async () => {
    const { alice } = await world();
    const { status } = await call('POST', '/posts', { token: alice.token, body: { caption: 'x'.repeat(2 * 1024 * 1024) } });
    expect(status).toBe(413);
  });
});

describe('hostile values', () => {
  it('turns null bytes into a refusal, wherever they land', async () => {
    const { alice } = await world();
    const token = alice.token;
    const nul = 'a\u0000b';
    const mine = await post(token);
    const attempts = [
      await call('PATCH', '/me', { token, body: { displayName: nul } }),
      await call('POST', `/posts/${mine.id}/replies`, { token, body: { text: nul } }),
      await call('POST', '/posts', { token, body: { id: randomUUID(), kind: 'workout', title: nul, caption: nul, showWeights: true, entries: [{ ...entry(), note: nul }], recipientIds: [] } }),
      await sync(token, [logged('nul', nul)]),
      await call('POST', '/auth/login', { body: { username: 'alice', password: nul } }),
    ];
    for (const attempt of attempts) expect(attempt.status).toBeLessThan(500);
  });

  it('refuses prototype pollution', async () => {
    const { alice } = await world();
    const response = await app.inject({
      method: 'PATCH', url: '/me', remoteAddress: '10.8.8.8',
      headers: { authorization: `Bearer ${alice.token}`, 'content-type': 'application/json' },
      payload: '{"displayName":"x","__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}}}',
    });
    expect(response.statusCode).toBeLessThan(500);
    expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });

  it('stores script tags and SQL as plain text', async () => {
    const { alice, bob } = await world();
    const evil = `<script>alert(1)</script>'; DROP TABLE users; --`;
    const mine = await post(alice.token);
    await call('POST', `/posts/${mine.id}/replies`, { token: bob.token, body: { text: evil } });
    expect((await call<{ replies: { text: string }[] }>('GET', `/posts/${mine.id}`, { token: alice.token })).body.replies[0]?.text).toBe(evil);
    expect(await userCount()).toBe(5);
  });
});

describe('abuse', () => {
  it('stops a friend flooding you with replies', async () => {
    const { alice, bob } = await world();
    const mine = await post(alice.token);
    const statuses = [];
    for (let i = 0; i < 32; i += 1) statuses.push((await call('POST', `/posts/${mine.id}/replies`, { token: bob.token, ip: '203.0.113.40', body: { text: 'spam' } })).status);
    expect(statuses.at(-1)).toBe(429);
  });

  it('won’t accept weights or dates outside what’s possible', async () => {
    const { alice } = await world();
    const key = await makeKey(alice.token);
    for (const entries of [[{ name: 'x', weight: -5 }], [{ name: 'x', weight: 1e9 }], [{ name: 'x', sets: -1 }], [{ name: 'x', rpe: 11 }], [{ name: '' }], []]) {
      expect((await call('POST', '/v1/workouts', { token: key, body: { workouts: [{ date: '2026-01-15', entries }] } })).status, JSON.stringify(entries)).toBe(400);
    }
    for (const date of ['2099-01-01', 'not-a-date', '2026-13-45', '']) {
      expect((await call('POST', '/v1/workouts', { token: key, body: { workouts: [{ date, entries: [{ name: 'x' }] }] } })).status, date).toBeLessThan(500);
    }
    expect((await call('POST', '/v1/workouts', { token: key, body: { workouts: [{ date: '2099-01-01', entries: [{ name: 'x' }] }] } })).status).toBe(400);
  });
});

describe('invite codes as keys', () => {
  it('stops the old code once you get a new one, and keeps your crew', async () => {
    const { alice, bob, mallory } = await world();
    const old = alice.user.inviteCode;
    const { body } = await call<{ code: string }>('POST', '/invites/rotate', { token: alice.token });
    expect(body.code).not.toBe(old);
    expect((await call('POST', '/friends', { token: mallory.token, body: { inviteCode: old } })).status).toBe(404);
    expect((await call('POST', '/auth/register', { body: { username: 'late', displayName: 'x', password: PASSWORD, inviteCode: old } })).status).toBe(400);
    expect((await call('GET', '/friends', { token: alice.token })).raw).toContain(bob.user.id);
    expect((await call('POST', '/friends', { token: mallory.token, body: { inviteCode: body.code } })).status).toBe(200);
  });

  it('keeps someone you removed out once the code has changed', async () => {
    const { alice, bob } = await world();
    const mine = await post(alice.token);
    await call('DELETE', `/friends/${bob.user.id}`, { token: alice.token });
    await call('POST', '/invites/rotate', { token: alice.token });
    expect((await call('POST', '/friends', { token: bob.token, body: { inviteCode: alice.user.inviteCode } })).status).toBe(404);
    expect((await call('GET', `/posts/${mine.id}`, { token: bob.token })).status).toBe(404);
  });
});

describe('sessions and keys', () => {
  it('kills a session at sign-out', async () => {
    const { alice } = await world();
    expect((await call('POST', '/auth/logout', { token: alice.token })).status).toBeLessThan(300);
    expect((await call('GET', '/me', { token: alice.token })).status).toBe(401);
  });

  it('signs out other devices and revokes keys when the password changes', async () => {
    const { alice } = await world();
    const other = await call<AuthResponse>('POST', '/auth/login', { body: { username: 'alice', password: PASSWORD } });
    const key = await makeKey(alice.token);
    const changed = await call('POST', '/me/password', { token: alice.token, body: { currentPassword: PASSWORD, newPassword: 'a different long password' } });
    expect(changed.status).toBeLessThan(300);
    expect((await call('GET', '/me', { token: other.body.token })).status).toBe(401);
    expect((await call('GET', '/v1/workouts', { token: key })).status).toBe(401);
    expect((await call('POST', '/auth/login', { body: { username: 'alice', password: PASSWORD } })).status).toBe(401);
  });

  it('won’t let a key stand in for a session', async () => {
    const { alice } = await world();
    const key = await makeKey(alice.token);
    for (const [method, url] of [['GET', '/me'], ['GET', '/me/api-keys'], ['GET', '/notifications'], ['GET', '/feed'], ['DELETE', '/me'], ['POST', '/me/password']] as const) {
      expect((await call(method, url, { token: key, body: method === 'GET' ? undefined : {} })).status, url).toBe(401);
    }
  });

  it('won’t let a session stand in for a key, or a deleted key still work', async () => {
    const { alice } = await world();
    expect((await call('GET', '/v1/workouts', { token: alice.token })).status).toBe(401);
    const made = await call<ApiKeyView & { key: string }>('POST', '/me/api-keys', { token: alice.token, body: { name: 'k', password: PASSWORD } });
    expect((await call('GET', '/v1/workouts', { token: made.body.key })).status).toBe(200);
    await call('DELETE', `/me/api-keys/${made.body.id}`, { token: alice.token });
    expect((await call('GET', '/v1/workouts', { token: made.body.key })).status).toBe(401);
  });

  it('stores secrets only as hashes', async () => {
    const { alice } = await world();
    const key = await makeKey(alice.token);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, 'alice'));
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(await db.select().from(schema.authSessions))).not.toContain(alice.token);
    expect(JSON.stringify(await db.select().from(schema.apiKeys))).not.toContain(key);
  });

  it('sends a shared phone’s notifications only to whoever signed in last', async () => {
    const { alice, mallory } = await world();
    const token = 'x'.repeat(100);
    await call('PUT', '/me/push-token', { token: alice.token, body: { token } });
    await call('PUT', '/me/push-token', { token: mallory.token, body: { token } });
    const rows = await db.select().from(schema.pushTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(mallory.user.id);
  });

  it('holds the key cap when requests arrive together', async () => {
    const { alice } = await world();
    await Promise.all(Array.from({ length: 12 }, (_, i) => call('POST', '/me/api-keys', { token: alice.token, body: { name: `k${i}`, password: PASSWORD } })));
    expect((await db.select().from(schema.apiKeys)).length).toBeLessThanOrEqual(10);
  });
});

describe('deleting an account', () => {
  it('needs the password, not just a session', async () => {
    const { alice } = await world();
    expect((await call('DELETE', '/me', { token: alice.token, body: {} })).status).toBe(400);
    expect((await call('DELETE', '/me', { token: alice.token, body: { password: 'wrong' } })).status).toBe(400);
    expect((await call('GET', '/me', { token: alice.token })).status).toBe(200);
  });

  it('leaves nothing of theirs behind', async () => {
    const { alice, bob } = await world();
    const key = await makeKey(alice.token);
    const mine = await post(alice.token);
    await sync(alice.token, [logged('gone')]);
    await call('PUT', '/me/push-token', { token: alice.token, body: { token: 'fcm-token-long-enough-for-the-schema' } });
    const theirs = await post(bob.token);
    await call('POST', `/posts/${theirs.id}/replies`, { token: alice.token, body: { text: 'bye' } });
    expect((await call('DELETE', '/me', { token: alice.token, body: { password: PASSWORD } })).status).toBe(204);
    const id = alice.user.id;
    expect(await db.select().from(schema.users).where(eq(schema.users.id, id))).toHaveLength(0);
    expect(await db.select().from(schema.authSessions).where(eq(schema.authSessions.userId, id))).toHaveLength(0);
    expect(await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, id))).toHaveLength(0);
    expect(await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.userId, id))).toHaveLength(0);
    expect(await db.select().from(schema.loggedWorkouts).where(eq(schema.loggedWorkouts.ownerId, id))).toHaveLength(0);
    expect(await db.select().from(schema.posts).where(eq(schema.posts.authorId, id))).toHaveLength(0);
    expect(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, id))).toHaveLength(0);
    expect(await db.select().from(schema.postReplies).where(eq(schema.postReplies.authorId, id))).toHaveLength(0);
    expect((await call('GET', `/posts/${mine.id}`, { token: bob.token })).status).toBe(404);
    expect((await call('GET', '/v1/me', { token: key })).status).toBe(401);
    expect((await call('GET', '/me', { token: alice.token })).status).toBe(401);
    expect((await call('GET', '/friends', { token: bob.token })).raw).not.toContain(id);
  });
});

