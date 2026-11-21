import {
  addDays, allTimeScore, cappedCallPoints, dateIn, DAY_MS, goalIn, goalsOf, mondayOf, periodDays, periodStats, rankingPeriodSchema, trainedDates, voice,
  runningStats, weekBonuses, weekStreak, type RankingPeriod, type RankingRow,
} from '@sandbag/shared';
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, DbOrTx } from '../db/client';
import { loggedWorkouts, notifications, runs, users } from '../db/schema';
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
export async function crewTable(db: DbOrTx, userId: string, period: RankingPeriod): Promise<RankingRow[]> {
  const crew = [userId, ...(await friendIds(db, userId))];
  const people = await db.select().from(users).where(inArray(users.id, crew));
  const workouts = await db.select({
    ownerId: loggedWorkouts.ownerId, date: loggedWorkouts.date, entries: loggedWorkouts.entries, loggedAt: loggedWorkouts.loggedAt, recordedAt: loggedWorkouts.recordedAt,
  })
    .from(loggedWorkouts)
    .where(and(inArray(loggedWorkouts.ownerId, crew), eq(loggedWorkouts.deleted, false)));
  const crewRuns = await db.select({ ownerId: runs.ownerId, date: runs.date, activity: runs.activity, distanceKm: runs.distanceKm, seconds: runs.seconds, loggedAt: runs.loggedAt })
    .from(runs)
    .where(and(inArray(runs.ownerId, crew), eq(runs.deleted, false)));
  const now = new Date();
  const settled = await settledCallPoints(db, crew, period === 'all' ? new Date(0) : new Date(now.getTime() - CALL_LOOKBACK_DAYS * DAY_MS));

  const rows = people.map((person) => {
    const day = dateIn(person.timeZone, now);
    const goals = goalsOf(person);
    // Read on their own calendar, so on time means by their own midnight.
    const on = (at: Date) => dateIn(person.timeZone, at);
    // Everything that can move a score, each with the moment it landed.
    const all = {
      workouts: workouts.filter((workout) => workout.ownerId === person.id)
        .map((workout) => ({ at: workout.loggedAt, date: workout.date, entries: workout.entries, loggedOn: on(workout.loggedAt), recordedOn: on(workout.recordedAt) })),
      runs: crewRuns.filter((run) => run.ownerId === person.id).map((run) => ({ ...run, at: run.loggedAt, loggedOn: on(run.loggedAt) })),
      calls: (settled.get(person.id) ?? [])
        .map(({ at, points }) => ({ at, day: dateIn(person.timeZone, at), points }))
        .filter((call) => call.day <= day)
        .map((call) => ({ ...call, monday: mondayOf(call.day) })),
    };
    // Running has no goal, so only the gym makes a streak, and only the gym counts days trained.
    const streak = weekStreak(trainedDates(all.workouts), goals, day);
    const shared = {
      user: toPublic(person),
      rank: 0,
      target: goalIn(goals, day),
      wearingSandbag: person.sandbagUntil !== null && person.sandbagUntil > now,
      streak: streak.current,
      shields: streak.shields,
    };
    const tally = (own: typeof all) => {
      const { calls } = own;
      if (period === 'all') {
        const callsByWeek = new Map([...new Set(calls.map((call) => call.monday))]
          .map((monday) => [monday, cappedCallPoints(calls.filter((call) => call.monday === monday))]));
        return {
          // Getting stronger needs a before to compare with, and all time has none.
          progress: 0,
          workouts: trainedDates(own.workouts).length,
          consistency: 0,
          bonuses: null,
          running: runningStats(own.runs, null, day),
          calls: [...callsByWeek.values()].reduce((sum, points) => sum + points, 0),
          score: allTimeScore(own, goals, day, callsByWeek),
        };
      }
      const start = addDays(day, 1 - periodDays(period, day));
      const stats = periodStats(own.workouts, period, goals, day);
      const bonuses = period === 'week' ? weekBonuses(own.workouts, goals, day) : null;
      const running = runningStats(own.runs, start, day);
      const callPoints = cappedCallPoints(calls.filter((call) => call.day >= start));
      return {
        ...stats,
        bonuses,
        running,
        calls: callPoints,
        // Calls can cost points, but never below nothing.
        score: Math.max(0, stats.score + (bonuses?.total ?? 0) + running.points + callPoints),
      };
    };
    const row = { ...shared, ...tally(all) };
    // When they got to this score: walking back from the newest, the first thing whose absence changes it.
    // Things that moved nothing, like a session logged too late to count, don't make anyone later.
    const moments = [...new Set([...all.workouts, ...all.runs, ...all.calls].map((thing) => thing.at.getTime()))].sort((a, b) => b - a);
    const before = (moment: number) => ({
      workouts: all.workouts.filter((thing) => thing.at.getTime() < moment),
      runs: all.runs.filter((thing) => thing.at.getTime() < moment),
      calls: all.calls.filter((thing) => thing.at.getTime() < moment),
    });
    const reachedAt = moments.find((moment) => tally(before(moment)).score !== row.score) ?? 0;
    return { row, reachedAt };
  });
  // Level on points, whoever got there first stands ahead. Their rank stays shared.
  rows.sort((a, b) => b.row.score - a.row.score || a.reachedAt - b.reachedAt || a.row.user.displayName.localeCompare(b.row.user.displayName));
  // Equal scores share a rank, and the next person skips it: 1, 2, 3, 3, 5.
  return rows.map(({ row }) => ({ ...row, rank: 1 + rows.filter((other) => other.row.score > row.score).length }));
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
    return crewTable(db, user.id, rankingPeriodSchema.parse(request.query.period ?? 'week'));
  });
}
