import {
  CALL_DAYS, CALL_POINTS, cappedCallPoints, CORRECTION_MS, DAY_MS, exposesSandbag, judgeCall, liftIn, LIVE_CALLS, mondayOf, SANDBAG_BADGE_DAYS, voice, WATCH_DAYS,
  type CallStatus, type LiftResult, type LoggedWorkout, type NotificationKind,
} from '@sandbag/shared';
import { and, desc, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { loggedWorkouts, sandbagCalls, users } from '../db/schema';
import { notify } from './notifications';

type Call = typeof sandbagCalls.$inferSelect;
type Person = { id: string; displayName: string };
type News = { kind: NotificationKind; title: string; body: string };

/** Verdicts that put the sandbag badge on the target. */
const LOST: CallStatus[] = ['failed', 'caught'];

/** Only a session logged after this moment can answer, and backdating one in doesn't count. */
function loggedSince(workout: Pick<LoggedWorkout, 'updatedAt' | 'date'>, moment: Date): boolean {
  return workout.updatedAt > moment.getTime() && Date.parse(`${workout.date}T00:00:00Z`) >= moment.getTime() - DAY_MS;
}

const sameLift = (a: LiftResult | null, b: LiftResult | null) => a?.max === b?.max && a?.rpe === b?.rpe;

/** The badge runs a week from the latest call someone lost, so a reversed verdict takes it back off. */
async function refreshBadge(db: DbOrTx, userId: string): Promise<void> {
  const [latest] = await db.select({ at: sandbagCalls.resolvedAt }).from(sandbagCalls)
    .where(and(eq(sandbagCalls.targetId, userId), inArray(sandbagCalls.status, LOST)))
    .orderBy(desc(sandbagCalls.resolvedAt))
    .limit(1);
  const until = latest?.at ? new Date(latest.at.getTime() + SANDBAG_BADGE_DAYS * DAY_MS) : null;
  await db.update(users).set({ sandbagUntil: until }).where(eq(users.id, userId));
}

/** Moves a call to a status, with the deadline that status runs to. */
async function setStatus(db: DbOrTx, call: Call, status: CallStatus, settledBy: string | null, extra: Partial<Call> = {}): Promise<void> {
  const now = new Date();
  const deadlineAt = status === 'open' ? new Date(call.createdAt.getTime() + CALL_DAYS * DAY_MS)
    : status === 'watching' ? new Date(now.getTime() + WATCH_DAYS * DAY_MS)
      : call.deadlineAt;
  await db.update(sandbagCalls)
    .set({ status, settledBy, deadlineAt, resolvedAt: status === 'open' ? null : now, ...extra })
    .where(eq(sandbagCalls.id, call.id));
  if (LOST.includes(status) || LOST.includes(call.status)) await refreshBadge(db, call.targetId);
}

/** Who hears about a verdict, and what they hear. */
function newsFor(status: CallStatus, target: string, exercise: string): { caller: News | null; target: News | null } {
  switch (status) {
    case 'cleared': return { caller: { kind: 'answered', title: 'Call answered', body: voice.callCleared(target, exercise) }, target: null };
    case 'failed': return { caller: { kind: 'confirmed', title: 'Sandbag confirmed', body: voice.callFailed(target, exercise) }, target: null };
    case 'watching': return { caller: { kind: 'watching', title: 'Honest miss?', body: voice.callWatching(target, exercise) }, target: null };
    case 'honest': return {
      caller: { kind: 'honest', title: 'Believed', body: voice.callBelieved(target, exercise) },
      target: { kind: 'honest', title: 'Believed', body: voice.callBelievedOnYou(exercise) },
    };
    case 'caught': return {
      caller: { kind: 'confirmed', title: 'Sandbag caught', body: voice.callCaught(target, exercise) },
      target: { kind: 'confirmed', title: 'Caught', body: voice.callCaughtOnYou(exercise) },
    };
    case 'open': return { caller: null, target: null };
  }
}

/** Tells both sides about a verdict. A title replaces the caller's, for a verdict that changed. */
async function tell(db: DbOrTx, call: Call, target: string, status: CallStatus, title?: string): Promise<void> {
  const news = newsFor(status, target, call.exercise);
  if (news.caller) await notify(db, call.callerId, { ...news.caller, ...(title ? { title } : {}), route: 'train' });
  if (news.target) await notify(db, call.targetId, { ...news.target, route: 'train' });
}

/** Open calls past their deadline fail, and watched misses past theirs are believed. */
export async function expireCalls(db: DbOrTx): Promise<void> {
  const due = await db.update(sandbagCalls)
    .set({
      status: sql<CallStatus>`case when ${sandbagCalls.status} = 'open' then 'failed' else 'honest' end`,
      // Settled when the time ran out, not whenever somebody next looked.
      resolvedAt: sql`${sandbagCalls.deadlineAt}`,
    })
    .where(and(inArray(sandbagCalls.status, LIVE_CALLS), lte(sandbagCalls.deadlineAt, new Date())))
    .returning();
  if (!due.length) return;
  const people = await db.select({ id: users.id, displayName: users.displayName }).from(users)
    .where(inArray(users.id, [...new Set(due.map((call) => call.targetId))]));
  const nameOf = new Map(people.map((person) => [person.id, person.displayName]));
  for (const call of due) {
    const target = nameOf.get(call.targetId) ?? 'They';
    if (call.status === 'honest') {
      await tell(db, call, target, 'honest');
      continue;
    }
    await refreshBadge(db, call.targetId);
    await notify(db, call.callerId, { kind: 'confirmed', title: 'Sandbag confirmed', body: voice.callExpired(target, call.exercise), route: 'train' });
    await notify(db, call.targetId, { kind: 'confirmed', title: 'Call ran out', body: voice.callExpiredOnYou(call.exercise), route: 'train' });
  }
}

/** A new session answers open calls on its lifts, and can catch a watched miss that wasn't one. */
async function answerCalls(db: DbOrTx, user: Person, workout: LoggedWorkout): Promise<void> {
  const live = await db.select().from(sandbagCalls).where(and(eq(sandbagCalls.targetId, user.id), inArray(sandbagCalls.status, LIVE_CALLS)));
  for (const call of live) {
    const lift = liftIn(workout.entries, call.exerciseKey);
    if (!lift) continue;
    if (call.status === 'open' && loggedSince(workout, call.createdAt)) {
      const status = judgeCall(call.targetMax, lift);
      await setStatus(db, call, status, workout.id);
      await tell(db, call, user.displayName, status);
    } else if (call.status === 'watching' && call.resolvedAt && loggedSince(workout, call.resolvedAt) && exposesSandbag(call.targetMax, lift)) {
      await setStatus(db, call, 'caught', workout.id);
      await tell(db, call, user.displayName, 'caught');
    }
  }
}

/** The answering session is gone: the next one since the call answers instead, or it's open again. */
async function reopen(db: DbOrTx, user: Person, call: Call, gone: string): Promise<void> {
  const sessions = await db.select().from(loggedWorkouts)
    .where(and(eq(loggedWorkouts.ownerId, user.id), eq(loggedWorkouts.deleted, false), ne(loggedWorkouts.id, gone)));
  const next = sessions
    .filter((session) => loggedSince(session, call.createdAt) && liftIn(session.entries, call.exerciseKey))
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt)[0];
  if (next) {
    const status = judgeCall(call.targetMax, liftIn(next.entries, call.exerciseKey)!);
    await setStatus(db, call, status, next.id);
    if (status !== call.status) await tell(db, call, user.displayName, status, 'Verdict changed');
    return;
  }
  // Keeps pointing at the session, so undoing the delete puts the verdict back.
  await setStatus(db, call, 'open', gone);
  await notify(db, call.callerId, { kind: 'call', title: 'Call reopened', body: voice.callReopened(user.displayName, call.exercise), route: 'train' });
}

/** A session that settled calls was edited or deleted. */
async function revisitCalls(db: DbOrTx, user: Person, before: LoggedWorkout, after: LoggedWorkout): Promise<void> {
  const settled = await db.select().from(sandbagCalls).where(and(eq(sandbagCalls.targetId, user.id), eq(sandbagCalls.settledBy, after.id)));
  for (const call of settled) {
    const was = before.deleted ? null : liftIn(before.entries, call.exerciseKey);
    const lift = after.deleted ? null : liftIn(after.entries, call.exerciseKey);
    if (sameLift(was, lift)) continue;

    if (call.status === 'open') {
      // Reopened by a delete, and the delete was undone.
      if (!lift) continue;
      const status = judgeCall(call.targetMax, lift);
      await setStatus(db, call, status, after.id);
      await tell(db, call, user.displayName, status);
    } else if (call.status === 'cleared' || call.status === 'watching') {
      if (!lift) {
        await reopen(db, user, call, after.id);
        continue;
      }
      const status = judgeCall(call.targetMax, lift);
      if (status === call.status) continue;
      await setStatus(db, call, status, after.id);
      await tell(db, call, user.displayName, status, 'Verdict changed');
    } else if (call.status === 'failed') {
      // One correction, soon after, by editing the numbers. Deleting the session changes nothing.
      const inTime = call.resolvedAt !== null && Date.now() - call.resolvedAt.getTime() <= CORRECTION_MS;
      if (!lift || call.correctedAt || !inTime) continue;
      const status = judgeCall(call.targetMax, lift);
      await setStatus(db, call, status, after.id, { correctedAt: new Date() });
      if (status !== 'failed') await tell(db, call, user.displayName, status, 'Verdict corrected');
    }
    // Honest and caught are final.
  }
}

/**
 * Keeps calls in step with a session being saved, given the server's copy from before.
 * Only a session the server sees for the first time answers a call, so editing an old one
 * upwards can't clear anything. Edits and deletes revisit only what that session decided.
 */
export async function callsOnSave(db: DbOrTx, user: Person, before: LoggedWorkout | null, after: LoggedWorkout): Promise<void> {
  if (!before) {
    if (!after.deleted) await answerCalls(db, user, after);
    return;
  }
  await revisitCalls(db, user, before, after);
}

/** Points from calls settled since a moment, for each of these people on either side, capped week by week. */
export async function callPointsSince(db: DbOrTx, userIds: string[], since: Date): Promise<Map<string, number>> {
  if (!userIds.length) return new Map();
  const rows = await db.select({ callerId: sandbagCalls.callerId, targetId: sandbagCalls.targetId, status: sandbagCalls.status, resolvedAt: sandbagCalls.resolvedAt })
    .from(sandbagCalls)
    .where(and(gte(sandbagCalls.resolvedAt, since), or(inArray(sandbagCalls.callerId, userIds), inArray(sandbagCalls.targetId, userIds))));
  const settled = new Map<string, { monday: string; points: number }[]>();
  const add = (userId: string, monday: string, points: number) => settled.set(userId, [...(settled.get(userId) ?? []), { monday, points }]);
  for (const row of rows) {
    const monday = mondayOf(row.resolvedAt!.toISOString().slice(0, 10));
    add(row.callerId, monday, CALL_POINTS[row.status].caller);
    add(row.targetId, monday, CALL_POINTS[row.status].target);
  }
  return new Map([...settled].map(([userId, points]) => [userId, cappedCallPoints(points)]));
}
