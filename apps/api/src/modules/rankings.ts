import {
  addDays, cappedCallPoints, dateIn, DAY_MS, goalIn, goalsOf, mondayOf, periodDays, periodSchema, periodStats, trainedDates, voice, weekBonuses, weekStreak,
  type Period, type RankingRow,
} from '@sandbag/shared';
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, DbOrTx } from '../db/client';
import { loggedWorkouts, notifications, users } from '../db/schema';
import { requireUser, toPublic } from './auth';
import { expireCalls, settledCallPoints } from './calls';
import { friendIds } from './friends';
import { notify } from './notifications';

/** Longer than any period, in any time zone, so every call a period could hold is fetched. */
const CALL_LOOKBACK_DAYS = 32;

/**
 * Only points, percentages and counts come out of here, so hidden weights stay hidden.
 * Everyone is scored on their own calendar: their week ends at their own midnight.
 */
export async function crewTable(db: DbOrTx, userId: string, period: Period): Promise<RankingRow[]> {
  const crew = [userId, ...(await friendIds(db, userId))];
  const people = await db.select().from(users).where(inArray(users.id, crew));
  const workouts = await db.select({ ownerId: loggedWorkouts.ownerId, date: loggedWorkouts.date, entries: loggedWorkouts.entries, recordedAt: loggedWorkouts.recordedAt })
    .from(loggedWorkouts)
    .where(and(inArray(loggedWorkouts.ownerId, crew), eq(loggedWorkouts.deleted, false)));
  const now = new Date();
  const settled = await settledCallPoints(db, crew, new Date(now.getTime() - CALL_LOOKBACK_DAYS * DAY_MS));

  const rows = people.map((person) => {
    const day = dateIn(person.timeZone, now);
    const start = addDays(day, 1 - periodDays(period, day));
    const goals = goalsOf(person);
    const own = workouts.filter((workout) => workout.ownerId === person.id);
    const stats = periodStats(own, period, goals, day);
    const streak = weekStreak(trainedDates(own), goals, day);
    const bonuses = period === 'week' ? weekBonuses(own, goals, day) : null;
    const calls = cappedCallPoints((settled.get(person.id) ?? [])
      .map(({ at, points }) => ({ day: dateIn(person.timeZone, at), points }))
      .filter((call) => call.day >= start && call.day <= day)
      .map((call) => ({ monday: mondayOf(call.day), points: call.points })));
    return {
      user: toPublic(person),
      rank: 0,
      target: goalIn(goals, day),
      wearingSandbag: person.sandbagUntil !== null && person.sandbagUntil > now,
      streak: streak.current,
      shields: streak.shields,
      ...stats,
      bonuses,
      calls,
      // Calls can cost points, but never below nothing.
      score: Math.max(0, stats.score + (bonuses?.total ?? 0) + calls),
    };
  });
  rows.sort((a, b) => b.score - a.score || a.user.displayName.localeCompare(b.user.displayName));
  // Equal scores share a rank, and the next person skips it: 1, 2, 3, 3, 5.
  return rows.map((row) => ({ ...row, rank: 1 + rows.filter((other) => other.score > row.score).length }));
}

export async function weekScores(db: DbOrTx, userId: string): Promise<Map<string, number>> {
  return new Map((await crewTable(db, userId, 'week')).map((row) => [row.user.id, row.score]));
}

/** Tells friends you've just passed them this week, at most once a day each. */
export async function notifyOvertaken(db: DbOrTx, user: { id: string; displayName: string }, before: Map<string, number>): Promise<void> {
  const after = await weekScores(db, user.id);
  const mineBefore = before.get(user.id) ?? 0;
  const mineAfter = after.get(user.id) ?? 0;
  const body = voice.overtaken(user.displayName);
  const dayAgo = new Date(Date.now() - 86_400_000);
  for (const [friendId, score] of after) {
    const theirsBefore = before.get(friendId) ?? 0;
    // Nobody with zero points has been overtaken. They were never in the race.
    if (friendId === user.id || theirsBefore === 0 || mineBefore > theirsBefore || mineAfter <= score) continue;
    const [recent] = await db.select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.userId, friendId), eq(notifications.body, body), gt(notifications.createdAt, dayAgo)));
    if (!recent) await notify(db, friendId, { kind: 'overtaken', title: 'Overtaken', body, route: 'rankings' });
  }
}

export function rankingRoutes(app: FastifyInstance, db: Db): void {
  app.get<{ Querystring: { period?: string } }>('/rankings', async (request): Promise<RankingRow[]> => {
    const user = await requireUser(db, request);
    await expireCalls(db);
    return crewTable(db, user.id, periodSchema.parse(request.query.period ?? 'week'));
  });
}
