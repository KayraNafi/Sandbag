import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { AuthResponse, Entry, LoggedWorkout, PostView, RankingRow, SavedExercise, SavedWorkout } from '@sandbag/shared';
import { and, eq, inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app';
import type { Db } from '../db/client';
import * as schema from '../db/schema';

// Fills a local dev database with a believable crew around one existing account.
// It only ever opens a local PGlite directory, so it can't touch a real server:
//   DATA_DIR=... npm run dev:seed -w @sandbag/api -- <username>
const username = process.argv[2]?.toLowerCase();
const dataDir = process.env.DATA_DIR;
if (!username || !dataDir) {
  console.error('Usage: DATA_DIR=... dev:seed <username>');
  process.exit(1);
}

const PASSWORD = 'demo-password-123';
const db = drizzle(new PGlite(dataDir), { schema });
await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../migrations', import.meta.url)) });
const app = await buildApp(db as unknown as Db, {});

const [me] = await db.select().from(schema.users).where(eq(schema.users.username, username));
if (!me) throw new Error(`No user called ${username}. Sign up in the app first.`);
const myInviteCode = me.inviteCode;

// A short-lived session, so the account's real password is never needed.
const myToken = randomBytes(32).toString('base64url');
const myTokenHash = createHash('sha256').update(myToken).digest('hex');
await db.insert(schema.authSessions).values({ tokenHash: myTokenHash, userId: me.id, expiresAt: new Date(Date.now() + 3_600_000) });

async function call<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, token?: string, body?: object): Promise<T> {
  const response = await app.inject({
    method, url,
    ...(body ? { payload: body } : {}),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (response.statusCode >= 400) throw new Error(`${method} ${url}: ${response.statusCode} ${response.body}`);
  return (response.body ? JSON.parse(response.body) : undefined) as T;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const lift = (name: string, weight: number | null, extra: Partial<Entry> = {}): Entry => ({
  id: randomUUID(), name, kind: 'strength', sets: 3, reps: 8, weight, perSide: false, rpe: 8, minutes: null, note: '', ...extra,
});

const session = (title: string, day: number, entries: Entry[], savedWorkoutId: string | null = null): LoggedWorkout => ({
  id: randomUUID(), date: daysAgo(day), title, savedWorkoutId, entries, updatedAt: Date.now(), deleted: false,
});

const sync = (token: string, loggedWorkouts: LoggedWorkout[], savedWorkouts: SavedWorkout[] = []) =>
  call('POST', '/sync', token, { cursor: 0, loggedWorkouts, savedWorkouts });

const post = (token: string, kind: 'workout' | 'share', title: string, caption: string, entries: Entry[], options: { showWeights?: boolean; recipientIds?: string[] } = {}) =>
  call<PostView>('POST', '/posts', token, {
    id: randomUUID(), kind, title, caption, entries, showWeights: options.showWeights ?? kind === 'workout', recipientIds: options.recipientIds ?? [],
  });

const reply = (token: string, id: string, text: string) => call('POST', `/posts/${id}/replies`, token, { text });
const respect = (token: string, id: string) => call('PUT', `/posts/${id}/respect`, token);
const callSandbag = (token: string, id: string, exercise: string, line: string) => call('POST', `/posts/${id}/calls`, token, { exercise, line });

const AVATARS = ['flat_top', 'bull', 'moustache', 'sandbag', 'potato'] as const;
// Use your own friends with DEMO_NAMES=user1:Name One,user2:Name Two, five of them, best to worst.
const NAMES = (process.env.DEMO_NAMES ?? 'rocco:Rocco,dex:Dex,big_tony:Big Tony,bruno:Bruno,chad:Chad').split(',').map((pair) => pair.split(':') as [string, string]);
const CREW = AVATARS.map((avatar, index) => ({ username: NAMES[index]![0], displayName: NAMES[index]![1], avatar }));

const existing = await db.select().from(schema.users).where(inArray(schema.users.username, CREW.map((person) => person.username)));
const firstRun = existing.length === 0;

// Running this again resets the crew's side of the story and leaves your own log alone.
if (!firstRun) {
  const ids = existing.map((user) => user.id);
  await db.delete(schema.posts).where(inArray(schema.posts.authorId, ids));
  await db.delete(schema.sandbagCalls).where(inArray(schema.sandbagCalls.callerId, ids));
  await db.delete(schema.loggedWorkouts).where(inArray(schema.loggedWorkouts.ownerId, ids));
  await db.update(schema.users).set({ sandbagUntil: null }).where(inArray(schema.users.id, ids));
  await db.delete(schema.notifications).where(and(eq(schema.notifications.userId, me.id), like(schema.notifications.title, 'Sandbag confirmed%')));
}

async function person(entry: (typeof CREW)[number]): Promise<AuthResponse> {
  const { username: name, displayName, avatar } = entry;
  const auth = existing.some((user) => user.username === name)
    ? await call<AuthResponse>('POST', '/auth/login', undefined, { username: name, password: PASSWORD })
    : await call<AuthResponse>('POST', '/auth/register', undefined, { username: name, displayName, password: PASSWORD, inviteCode: myInviteCode });
  await call('PATCH', '/me', auth.token, { displayName, avatar });
  return auth;
}
const [rocco, dex, tony, bruno, chad] = await Promise.all(CREW.map(person)) as [AuthResponse, AuthResponse, AuthResponse, AuthResponse, AuthResponse];

// They all know each other, and you. Adding by code doesn't count as an invite.
const crew = [rocco, dex, tony, bruno, chad];
for (const [index, one] of crew.entries()) {
  await app.inject({ method: 'POST', url: '/friends', headers: { authorization: `Bearer ${one.token}` }, payload: { inviteCode: myInviteCode } });
  for (const other of crew.slice(index + 1)) {
    await app.inject({ method: 'POST', url: '/friends', headers: { authorization: `Bearer ${one.token}` }, payload: { inviteCode: other.user.inviteCode } });
  }
}

const startWeight = (name: string) => 20 + (createHash('md5').update(name).digest()[0]! % 8) * 5;

if (firstRun) {
  // Your history: on the saved workouts you already have, plus a Lower to rotate through.
  const mySaved = await db.select().from(schema.savedWorkouts).where(eq(schema.savedWorkouts.ownerId, me.id));
  const active = mySaved.filter((row) => !row.deleted && row.exercises.length);
  const lower: SavedWorkout = {
    id: randomUUID(), name: 'Lower', position: mySaved.reduce((max, row) => Math.max(max, row.position + 1), 0),
    exercises: [
      { name: 'Squat', kind: 'strength', sets: 3, reps: 8 },
      { name: 'Romanian deadlift', kind: 'strength', sets: 3, reps: 10 },
      { name: 'Leg press', kind: 'strength', sets: 3, reps: 12 },
    ] satisfies SavedExercise[],
    savedFrom: null, updatedAt: Date.now(), deleted: false,
  };
  const plans = [...active, lower];
  const days = [27, 25, 22, 20, 18, 15, 13, 11, 8, 6, 3, 1];
  const myHistory = days.map((day, index) => {
    const plan = plans[index % plans.length]!;
    return session(plan.name, day, plan.exercises.map((exercise) => lift(exercise.name, startWeight(exercise.name) + 2.5 * Math.floor(index / plans.length))), plan.id);
  });
  await sync(myToken, myHistory, [lower]);

  const myLast = myHistory.at(-1)!;
  const myPost = await post(myToken, 'workout', myLast.title, 'Felt light. Suspiciously light.', myLast.entries);
  await respect(rocco.token, myPost.id);
  await respect(dex.token, myPost.id);
  await reply(tony.token, myPost.id, 'Those numbers look made up.');
  await reply(rocco.token, myPost.id, 'Show the video or it didn’t happen.');
  // An open call on you: your next session of this lift settles it.
  await callSandbag(dex.token, myPost.id, myLast.entries[0]!.name, 'RPE 8? You were on your phone between sets.');

  const shared = plans[0]!;
  const myShare = await post(myToken, 'share', shared.name, 'Steal this. It won’t help.', shared.exercises.map((exercise) => lift(exercise.name, null)));
  await call('POST', `/posts/${myShare.id}/save`, rocco.token);
}

// The week's table, worst to best, using the same before-the-period number each time:
// +1% is 10 progress points, and consistency is workouts against a target of 3.
// Finished weeks count towards a streak, so these hit the target of 3 from Monday.
const mondayOffset = (new Date().getUTCDay() + 6) % 7;
const fullWeeks = (weeks: number) => Array.from({ length: weeks }, (_, index) => {
  const monday = mondayOffset + 7 * (weeks - index);
  return [monday, monday - 1, monday - 2];
}).flat();
const rise = (title: string, name: string, before: number[], base: number, thisWeek: [day: number, weight: number][]) => [
  ...before.map((day, index) => session(title, day, [lift(name, base - (before.length - 1 - index) * 2.5)])),
  ...thisWeek.map(([day, weight]) => session(title, day, [lift(name, weight)])),
];
await sync(rocco.token, rise('Upper', 'Bench press', fullWeeks(3), 60, [[5, 60.5], [3, 61], [1, 61.5]])); // Second, on a four week streak.
await sync(tony.token, rise('Push', 'Bench press', fullWeeks(2), 100, [[4, 100.5], [2, 101]])); // Level with Dex.
await sync(dex.token, rise('Pull', 'Deadlift', fullWeeks(1), 100, [[4, 100.5], [2, 101]])); // Level with Big Tony.
await sync(bruno.token, rise('Deadlifts', 'Deadlift', [22, 15, 8], 100, [])); // The one session that fails his call comes below.
// Chad hasn't logged a thing. He has reasons.

const roccoPost = await post(rocco.token, 'workout', 'Upper', 'New bench best. I’ll be insufferable.', [lift('Bench press', 61.5, { rpe: 9 }), lift('Lat pulldown', 62.5), lift('Cable curls', 15.9, { note: 'last set 18' })]);
await reply(dex.token, roccoPost.id, 'Finally.');
await respect(dex.token, roccoPost.id);

const dexPost = await post(dex.token, 'workout', 'Pull', 'Not telling you the weights. Ask me why.', [lift('Deadlift', 101, { rpe: 6 }), lift('Lat pulldown', 74)], { showWeights: false });
await respect(tony.token, dexPost.id);

await post(tony.token, 'share', 'Push Day', 'The one that actually fixed my shoulders.', [lift('Incline press', null, { sets: 4, reps: 10 }), lift('Lateral raises', null, { sets: 3, reps: 15 }), lift('Dips', null, { sets: 3, reps: 12 }), lift('Rope', null, { kind: 'time', sets: null, reps: null, minutes: 5 })]);
await post(rocco.token, 'share', 'Leg Day From Hell', 'You won’t walk. You’re welcome.', [lift('Squat', null, { sets: 5, reps: 5 }), lift('Hip thrust', null, { sets: 4, reps: 8 }), lift('Walking lunges', null, { sets: 3, reps: 20 })]);
await post(tony.token, 'workout', 'For your eyes only', 'Only sent this to you. Don’t tell Dex.', [lift('Squat', 72.5, { rpe: 10, note: 'never again' })], { recipientIds: [me.id] });
await post(chad.token, 'workout', 'Starting Monday', 'This time I mean it.', [lift('Walking to the gym', null, { note: 'got as far as the car' })]);

// Your call on Bruno, which he fails: the sandbag badge, and a notification for you.
const brunoPost = await post(bruno.token, 'workout', 'Deadlifts', 'Easy day.', [lift('Deadlift', 100, { rpe: 6 })]);
await callSandbag(myToken, brunoPost.id, 'Deadlift', 'RPE 6, sure.');
await sync(bruno.token, [{ ...session('Deadlifts', 0, [lift('Deadlift', 100, { rpe: 10, note: 'tweaked something, allegedly' })]), updatedAt: Date.now() + 1000 }]);

// One open call for you to watch, and Rocco's other lifts are there for you to call.
await callSandbag(dex.token, roccoPost.id, 'Cable curls', 'With that note? Do it clean.');

const table = await call<RankingRow[]>('GET', '/rankings?period=week', myToken);
for (const row of table) console.log(row.rank, row.user.displayName, `${row.score} pts`, `progress ${row.progress}%`, `${row.workouts}/${row.target}`, `streak ${row.streak}`, row.wearingSandbag ? 'SANDBAG' : '');
const month = await call<RankingRow[]>('GET', '/rankings?period=month', myToken);
console.log('month:', month.map((row) => `${row.user.displayName} ${row.score}`).join(', '));

await db.delete(schema.authSessions).where(eq(schema.authSessions.tokenHash, myTokenHash));
await app.close();
console.log(`Crew ready around ${username}. Every demo password: ${PASSWORD}`);
process.exit(0);
