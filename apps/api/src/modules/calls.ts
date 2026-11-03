import {
  addDays, callPoints, dateIn, entrySetup, exerciseKey, mondayOf, overHonestMiss, resolveCall, SANDBAG_BADGE_DAYS, topEntry, voice, WATCH_DAYS,
  type CallStatus, type LoggedWorkout,
} from '@sandbag/shared';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, or } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../db/client';
import { loggedWorkouts, sandbagCalls, users } from '../db/schema';
import { notify } from './notifications';

const DAY_MS = 86_400_000;
/** Long enough to fix a typo, too short to go and look up what the number needed to be. */
const CORRECTION_MS = DAY_MS;

type Call = typeof sandbagCalls.$inferSelect;
type Session = Pick<LoggedWorkout, 'id' | 'date' | 'entries' | 'updatedAt'>;

async function wearBadge(db: DbOrTx, userId: string, from: Date): Promise<void> {
  await db.update(users).set({ sandbagUntil: new Date(from.getTime() + SANDBAG_BADGE_DAYS * DAY_MS) }).where(eq(users.id, userId));
}

/** Only the first answer counts, so a late sync and an expiry can't both settle one call. */
async function setVerdict(tx: Tx, call: Call, status: CallStatus, changes: Partial<Call>): Promise<boolean> {
  const updated = await tx.update(sandbagCalls).set({ status, ...changes })
    .where(and(eq(sandbagCalls.id, call.id), eq(sandbagCalls.status, call.status)))
    .returning({ id: sandbagCalls.id });
  return updated.length > 0;
}

/**
 * The next logged session of a lift answers a call on it, if it was weighed the same
 * way. Skipping the lift, renaming it or leaving the weight blank doesn't help: the
 * deadline still comes. A session logged before the call doesn't count. Returns whether
 * this session had an answer in it.
 */
async function answerCall(tx: Tx, user: { id: string; displayName: string }, call: Call, workout: Session): Promise<boolean> {
  if (workout.updatedAt <= call.createdAt.getTime() || Date.parse(`${workout.date}T00:00:00Z`) < call.createdAt.getTime() - DAY_MS) return false;
  const key = exerciseKey(call.exercise);
  const top = topEntry(workout.entries.filter((item) => exerciseKey(item.name) === key && (call.targetSetup === null || entrySetup(item) === call.targetSetup)));
  if (!top) return false;
  const { entry, max: logged } = top;
  const now = new Date();

  if (call.status === 'watching') {
    if (overHonestMiss(call.targetMax, logged) && await setVerdict(tx, call, 'confirmed', { resolvedAt: now, settledBy: workout.id })) {
      await wearBadge(tx, user.id, now);
      await notify(tx, call.callerId, { title: 'Sandbag confirmed', body: voice.confirmed(user.displayName, call.exercise), route: 'rankings' });
      await notify(tx, user.id, { title: 'Sandbag confirmed', body: voice.confirmedYou(call.exercise), route: 'rankings' });
    }
    return true;
  }

  const status = resolveCall(call.targetMax, logged, entry.rpe);
  if (status === 'watching') {
    if (await setVerdict(tx, call, 'watching', { deadlineAt: new Date(now.getTime() + WATCH_DAYS * DAY_MS), settledBy: workout.id })) {
      await notify(tx, call.callerId, { title: 'Honest miss', body: voice.honestMiss(user.displayName, call.exercise), route: 'rankings' });
      await notify(tx, user.id, { title: 'Honest miss', body: voice.honestMissYou(call.exercise), route: 'train' });
    }
    return true;
  }
  if (!await setVerdict(tx, call, status, { resolvedAt: now, settledBy: workout.id })) return true;
  if (status === 'failed') await wearBadge(tx, user.id, now);
  await notify(tx, call.callerId, {
    title: status === 'cleared' ? 'Call answered' : 'Sandbag confirmed',
    body: status === 'cleared' ? voice.callCleared(user.displayName, call.exercise) : voice.callFailed(user.displayName, call.exercise),
    route: 'rankings',
  });
  await notify(tx, user.id, {
    title: status === 'cleared' ? 'Not guilty' : 'Sandbag',
    body: status === 'cleared' ? voice.callClearedYou(call.exercise) : voice.callFailedYou(call.exercise),
    route: 'rankings',
  });
  return true;
}

export async function settleCalls(tx: Tx, user: { id: string; displayName: string }, workout: LoggedWorkout): Promise<void> {
  if (workout.deleted) return;
  const live = await tx.select().from(sandbagCalls).where(and(eq(sandbagCalls.targetId, user.id), inArray(sandbagCalls.status, ['open', 'watching'])));
  for (const call of live) await answerCall(tx, user, call, workout);
}

/** The badge lasts as long as the most recent verdict that earned it. */
async function refreshBadge(tx: Tx, userId: string): Promise<void> {
  const [latest] = await tx.select({ resolvedAt: sandbagCalls.resolvedAt }).from(sandbagCalls)
    .where(and(eq(sandbagCalls.targetId, userId), inArray(sandbagCalls.status, ['failed', 'confirmed']), isNotNull(sandbagCalls.resolvedAt)))
    .orderBy(desc(sandbagCalls.resolvedAt)).limit(1);
  const until = latest?.resolvedAt ? new Date(latest.resolvedAt.getTime() + SANDBAG_BADGE_DAYS * DAY_MS) : null;
  await tx.update(users).set({ sandbagUntil: until && until > new Date() ? until : null }).where(eq(users.id, userId));
}

/**
 * A verdict has to stay true when the session behind it changes. Deleting a session that
 * cleared a call reopens it, so logging 500 kg and deleting it doesn't work. A failed call
 * gets one correction, soon after and only by editing, because typos happen and the caller
 * gets told. Deleting a failed session changes nothing. A reopened call then looks through
 * every other session for its answer, oldest first, as if this one had never settled it.
 */
export async function reopenCalls(tx: Tx, user: { id: string; displayName: string }, workout: Pick<LoggedWorkout, 'id' | 'deleted'>): Promise<void> {
  const settled = await tx.select().from(sandbagCalls)
    .where(and(eq(sandbagCalls.targetId, user.id), eq(sandbagCalls.settledBy, workout.id), inArray(sandbagCalls.status, ['cleared', 'watching', 'failed'])));
  if (!settled.length) return;
  const sessions = await tx.select({ id: loggedWorkouts.id, date: loggedWorkouts.date, entries: loggedWorkouts.entries, updatedAt: loggedWorkouts.updatedAt }).from(loggedWorkouts)
    .where(and(eq(loggedWorkouts.ownerId, user.id), eq(loggedWorkouts.deleted, false)))
    .orderBy(asc(loggedWorkouts.date), asc(loggedWorkouts.updatedAt));
  const now = new Date();
  for (const call of settled) {
    const correcting = call.status === 'failed';
    if (correcting && (workout.deleted || call.correctedAt || !call.resolvedAt || now.getTime() - call.resolvedAt.getTime() > CORRECTION_MS)) continue;
    const [reopened] = await tx.update(sandbagCalls)
      .set({ status: 'open', resolvedAt: null, settledBy: null, ...(correcting ? { correctedAt: now } : {}) })
      .where(and(eq(sandbagCalls.id, call.id), eq(sandbagCalls.status, call.status)))
      .returning();
    if (!reopened) continue;
    for (const session of sessions) {
      if (await answerCall(tx, user, reopened, session)) break;
    }
    if (!correcting) continue;
    const [after] = await tx.select({ status: sandbagCalls.status }).from(sandbagCalls).where(eq(sandbagCalls.id, call.id));
    if (after?.status === 'failed') continue;
    await refreshBadge(tx, user.id);
    await notify(tx, call.callerId, { title: 'Session edited', body: voice.callCorrected(user.displayName, call.exercise), route: 'rankings' });
  }
}

/**
 * Calls and watches that have run out of time. There's no scheduler, so this runs when
 * someone looks. The verdict is dated to the deadline, so it lands in the right week
 * however late anyone opens the app.
 */
export async function expireCalls(db: DbOrTx, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  const now = new Date();
  const due = await db.select().from(sandbagCalls).where(and(
    inArray(sandbagCalls.status, ['open', 'watching']),
    lt(sandbagCalls.deadlineAt, now),
    or(inArray(sandbagCalls.targetId, userIds), inArray(sandbagCalls.callerId, userIds)),
  ));
  if (!due.length) return;
  await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    for (const call of due) {
      if (call.status === 'watching') {
        await setVerdict(tx, call, 'honest', { resolvedAt: call.deadlineAt });
        continue;
      }
      if (!await setVerdict(tx, call, 'failed', { resolvedAt: call.deadlineAt, settledBy: null })) continue;
      const [target] = await tx.select({ displayName: users.displayName }).from(users).where(eq(users.id, call.targetId));
      if (call.deadlineAt.getTime() + SANDBAG_BADGE_DAYS * DAY_MS > now.getTime()) await wearBadge(tx, call.targetId, call.deadlineAt);
      await notify(tx, call.callerId, { title: 'Sandbag confirmed', body: voice.callExpired(target?.displayName ?? 'They', call.exercise), route: 'rankings' });
      await notify(tx, call.targetId, { title: 'Sandbag', body: voice.callExpiredYou(call.exercise), route: 'rankings' });
    }
  });
}

/** Each person's call points for their own week, from verdicts dated inside it on their own calendar. */
export async function callPointsFor(db: DbOrTx, userIds: string[], weekOf: (userId: string) => { monday: string; zone: string | null }): Promise<Map<string, number>> {
  const points = new Map<string, number>();
  if (!userIds.length) return points;
  const mondays = userIds.map((id) => weekOf(id).monday).sort();
  const from = new Date(`${addDays(mondays[0]!, -1)}T00:00:00Z`);
  const to = new Date(`${addDays(mondays.at(-1)!, 8)}T00:00:00Z`);
  const calls = await db.select({ status: sandbagCalls.status, targetId: sandbagCalls.targetId, callerId: sandbagCalls.callerId, resolvedAt: sandbagCalls.resolvedAt }).from(sandbagCalls).where(and(
    isNotNull(sandbagCalls.resolvedAt),
    gte(sandbagCalls.resolvedAt, from),
    lt(sandbagCalls.resolvedAt, to),
    or(inArray(sandbagCalls.targetId, userIds), inArray(sandbagCalls.callerId, userIds)),
  ));
  const wanted = new Set(userIds);
  const add = (userId: string, value: number, at: Date) => {
    if (!wanted.has(userId)) return;
    const { monday, zone } = weekOf(userId);
    if (mondayOf(dateIn(zone, at)) === monday) points.set(userId, (points.get(userId) ?? 0) + value);
  };
  for (const call of calls) {
    add(call.targetId, callPoints(call.status, 'target'), call.resolvedAt!);
    add(call.callerId, callPoints(call.status, 'caller'), call.resolvedAt!);
  }
  return points;
}
