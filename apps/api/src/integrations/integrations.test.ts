import { PGlite } from '@electric-sql/pglite';
import type { AuthResponse, IntegrationsResponse, IntegrationView, SyncResponse } from '@sandbag/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import { importPending } from './inbox';
import { lyftaFetcher } from './lyfta';
import { BadKey, PULL_EVERY_MS, pullDue, type Fetcher, type PulledWorkout } from './pull';
import { makeSealingKeys } from './sealing';

const BOOTSTRAP = 'founder-invite-code-long-enough';
const LYFTA_KEY = 'lyfta-personal-key-123';
let keys: { publicKey: string; privateKey: string };
let app: FastifyInstance;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => { keys = makeSealingKeys(); });

beforeEach(async () => {
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../migrations', import.meta.url)) });
  app = await buildApp(db as unknown as Db, { bootstrapInviteCode: BOOTSTRAP, integrationPublicKey: keys.publicKey });
});

async function call<T>(method: 'GET' | 'PUT' | 'DELETE' | 'POST', url: string, token: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { authorization: `Bearer ${token}` } });
  return { status: response.statusCode, body: (response.body ? JSON.parse(response.body) : undefined) as T };
}

async function signUp(): Promise<AuthResponse> {
  const response = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'lifter', displayName: 'Lifter', password: 'correct horse battery', inviteCode: BOOTSTRAP } });
  return JSON.parse(response.body) as AuthResponse;
}

const connect = (token: string, unit = 'kg') => call<IntegrationView>('PUT', '/me/integrations/lyfta', token, { key: LYFTA_KEY, settings: { unit } });

const lyftaWorkout = (id: number, date: string, weight = '100') => ({
  id, title: `Session ${id}`, workout_perform_date: `${date}T10:00:00.000Z`,
  exercises: [{ excercise_name: 'Back Squat', sets: [{ weight, reps: '5', rir: '1', is_completed: true }] }],
});

/** A stand-in for Lyfta that remembers which key it was given and what it was asked for. */
function fakeLyfta(workouts: () => ReturnType<typeof lyftaWorkout>[]) {
  const asked: { key: string; since: string | null }[] = [];
  const fetcher: Fetcher = {
    fetchWorkouts: async (key, since) => {
      asked.push({ key, since });
      if (key !== LYFTA_KEY) throw new BadKey();
      return workouts()
        .filter((workout) => !since || workout.workout_perform_date >= since)
        .map((workout): PulledWorkout => ({ externalId: String(workout.id), performedAt: new Date(workout.workout_perform_date), payload: workout }));
    },
  };
  return { fetcher, asked };
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);
const failOnError = (error: unknown) => { throw error; };

async function sessions(token: string) {
  const { body } = await call<SyncResponse>('POST', '/sync', token, { cursor: 0, loggedWorkouts: [], savedWorkouts: [], runs: [] });
  return body.loggedWorkouts.filter((workout) => !workout.deleted);
}

describe('connecting another app', () => {
  it('keeps only a sealed key, and lists what can be connected', async () => {
    const me = await signUp();
    const connected = await connect(me.token);
    expect(connected).toMatchObject({ status: 200, body: { provider: 'lyfta', status: 'connecting', settings: { unit: 'kg' }, imported: 0 } });
    const [row] = await db.select().from(schema.integrations);
    expect(row!.sealedKey).not.toContain(LYFTA_KEY);
    expect((await call<IntegrationsResponse>('GET', '/me/integrations', me.token)).body).toMatchObject({ available: ['lyfta'], connected: [{ provider: 'lyfta' }] });
  });

  it('checks the provider’s own settings, and knows only real providers', async () => {
    const me = await signUp();
    expect((await connect(me.token, 'stone')).status).toBe(400);
    expect((await call('PUT', '/me/integrations/nope', me.token, { key: LYFTA_KEY, settings: {} })).status).toBe(404);
  });

  it('says so when this server isn’t set up to import', async () => {
    app = await buildApp(db as unknown as Db, { bootstrapInviteCode: BOOTSTRAP });
    const me = await signUp();
    expect((await call<IntegrationsResponse>('GET', '/me/integrations', me.token)).body.available).toEqual([]);
    expect((await connect(me.token)).status).toBe(404);
  });
});

describe('importing', () => {
  it('pulls the whole history first, then turns it into sessions with the catalog’s names', async () => {
    const me = await signUp();
    await connect(me.token);
    const lyfta = fakeLyfta(() => [lyftaWorkout(1, daysAgo(40)), lyftaWorkout(2, daysAgo(1))]);
    expect(await pullDue(db as unknown as Db, keys.privateKey, { lyfta: lyfta.fetcher }, failOnError)).toBe(1);
    expect(lyfta.asked).toEqual([{ key: LYFTA_KEY, since: null }]);
    expect(await sessions(me.token)).toEqual([]);

    expect(await importPending(db as unknown as Db)).toBe(2);
    const imported = await sessions(me.token);
    expect(imported.map((workout) => workout.id).sort()).toEqual(['lyfta-1', 'lyfta-2']);
    expect(imported[0]!.entries[0]).toMatchObject({ name: 'Squat', weight: 100, reps: 5, rpe: 9 });
    expect((await call<IntegrationsResponse>('GET', '/me/integrations', me.token)).body.connected[0]).toMatchObject({ status: 'ok', imported: 2 });
    expect(await importPending(db as unknown as Db)).toBe(0);
  });

  it('rests between pulls, then only looks back a fortnight and follows edits and deletions', async () => {
    const me = await signUp();
    await connect(me.token);
    let workouts = [lyftaWorkout(1, daysAgo(40)), lyftaWorkout(2, daysAgo(3)), lyftaWorkout(3, daysAgo(2))];
    const lyfta = fakeLyfta(() => workouts);
    await pullDue(db as unknown as Db, keys.privateKey, { lyfta: lyfta.fetcher }, failOnError);
    await importPending(db as unknown as Db);

    expect(await pullDue(db as unknown as Db, keys.privateKey, { lyfta: lyfta.fetcher }, failOnError)).toBe(0);
    workouts = [lyftaWorkout(1, daysAgo(40)), lyftaWorkout(2, daysAgo(3), '110')];
    await pullDue(db as unknown as Db, keys.privateKey, { lyfta: lyfta.fetcher }, failOnError, later(PULL_EVERY_MS / 60_000 + 1));
    expect(lyfta.asked[1]!.since).toBe(daysAgo(14));
    expect(await importPending(db as unknown as Db)).toBe(2);

    const after = await sessions(me.token);
    expect(after.map((workout) => workout.id).sort()).toEqual(['lyfta-1', 'lyfta-2']);
    expect(after.find((workout) => workout.id === 'lyfta-2')!.entries[0]!.weight).toBe(110);
  });

  it('stops asking with a key the provider refused, until it’s connected again', async () => {
    const me = await signUp();
    await call('PUT', '/me/integrations/lyfta', me.token, { key: 'revoked-key-456', settings: { unit: 'kg' } });
    const lyfta = fakeLyfta(() => []);
    await pullDue(db as unknown as Db, keys.privateKey, { lyfta: lyfta.fetcher }, failOnError);
    expect((await call<IntegrationsResponse>('GET', '/me/integrations', me.token)).body.connected[0]!.status).toBe('bad_key');
    expect(await pullDue(db as unknown as Db, keys.privateKey, { lyfta: lyfta.fetcher }, failOnError, later(60))).toBe(0);
    await connect(me.token);
    expect(await pullDue(db as unknown as Db, keys.privateKey, { lyfta: lyfta.fetcher }, failOnError, later(60))).toBe(1);
  });

  it('marks a provider that couldn’t be reached, and carries on with the rest', async () => {
    const me = await signUp();
    await connect(me.token);
    const errors: unknown[] = [];
    const down: Fetcher = { fetchWorkouts: () => Promise.reject(new Error('Lyfta answered 503')) };
    await pullDue(db as unknown as Db, keys.privateKey, { lyfta: down }, (error) => errors.push(error));
    expect(errors).toHaveLength(1);
    const [row] = await db.select().from(schema.integrations);
    expect(row!.status).toBe('failing');
  });

  it('imports everything again when the settings change', async () => {
    const me = await signUp();
    await connect(me.token);
    await pullDue(db as unknown as Db, keys.privateKey, { lyfta: fakeLyfta(() => [lyftaWorkout(1, daysAgo(1))]).fetcher }, failOnError);
    await importPending(db as unknown as Db);
    await connect(me.token, 'lb');
    expect(await importPending(db as unknown as Db)).toBe(1);
    expect((await sessions(me.token))[0]!.entries[0]!.weight).toBe(45.36);
  });
});

describe('disconnecting', () => {
  async function withImports() {
    const me = await signUp();
    await connect(me.token);
    await pullDue(db as unknown as Db, keys.privateKey, { lyfta: fakeLyfta(() => [lyftaWorkout(1, daysAgo(1))]).fetcher }, failOnError);
    await importPending(db as unknown as Db);
    return me;
  }

  it('leaves the sessions in History by default, and forgets the key and inbox', async () => {
    const me = await withImports();
    expect((await call('DELETE', '/me/integrations/lyfta', me.token)).status).toBe(204);
    expect(await sessions(me.token)).toHaveLength(1);
    expect(await db.select().from(schema.integrations)).toEqual([]);
    expect(await db.select().from(schema.integrationImports)).toEqual([]);
  });

  it('takes the sessions too when asked', async () => {
    const me = await withImports();
    await call('DELETE', '/me/integrations/lyfta', me.token, { removeWorkouts: true });
    expect(await sessions(me.token)).toEqual([]);
  });

  it('doesn’t touch sessions logged in the app', async () => {
    const me = await withImports();
    const own = { id: 'own-1', date: daysAgo(1), title: 'Mine', savedWorkoutId: null, entries: [], updatedAt: Date.now(), deleted: false };
    await call('POST', '/sync', me.token, { cursor: 0, loggedWorkouts: [own], savedWorkouts: [], runs: [] });
    await call('DELETE', '/me/integrations/lyfta', me.token, { removeWorkouts: true });
    expect((await sessions(me.token)).map((workout) => workout.id)).toEqual(['own-1']);
    const [row] = await db.select().from(schema.loggedWorkouts).where(eq(schema.loggedWorkouts.id, 'lyfta-1'));
    expect(row!.deleted).toBe(true);
  });
});

describe('the Lyfta fetcher', () => {
  function fakeFetch(pages: { status?: number; body?: object }[]) {
    const urls: URL[] = [];
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      urls.push(url);
      expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${LYFTA_KEY}`);
      const page = pages[urls.length - 1]!;
      return new Response(JSON.stringify(page.body ?? {}), { status: page.status ?? 200 });
    }) as unknown as typeof fetch;
    return { fetchImpl, urls };
  }

  it('reads every page, and asks only from a day when given one', async () => {
    const { fetchImpl, urls } = fakeFetch([
      { body: { total_pages: 2, workouts: [lyftaWorkout(1, '2026-11-01')] } },
      { body: { total_pages: 2, workouts: [lyftaWorkout(2, '2026-11-02'), { title: 'no id' }] } },
    ]);
    const found = await lyftaFetcher({ fetchImpl, base: 'https://lyfta.test', gapMs: 0 }).fetchWorkouts(LYFTA_KEY, '2026-10-25');
    expect(found.map((workout) => workout.externalId)).toEqual(['1', '2']);
    expect(urls.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
    expect(urls[0]!.searchParams.get('from')).toBe('2026-10-25');
  });

  it('tells a refused key from Lyfta being down', async () => {
    await expect(lyftaFetcher({ fetchImpl: fakeFetch([{ status: 401 }]).fetchImpl, base: 'https://lyfta.test', gapMs: 0 }).fetchWorkouts(LYFTA_KEY, null)).rejects.toBeInstanceOf(BadKey);
    await expect(lyftaFetcher({ fetchImpl: fakeFetch([{ status: 503 }]).fetchImpl, base: 'https://lyfta.test', gapMs: 0 }).fetchWorkouts(LYFTA_KEY, null)).rejects.toThrow('503');
  });
});
