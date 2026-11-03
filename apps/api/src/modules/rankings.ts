import {
  addDays, dateIn, goalIn, goalsOf, mondayOf, periodSchema, periodStats, trainedDates, voice, weekBonuses, weekStreak,
  type GoalChange, type Period, type PeriodStats, type RankingRow, type Streak, type WeekBonuses,
} from '@sandbag/shared';
import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, DbOrTx } from '../db/client';
import { crewMembers, loggedWorkouts, notifications, streakPauses, users } from '../db/schema';
import { requireUser, toPublic } from './auth';
import { callPointsFor, expireCalls } from './calls';
import { friendIds } from './friends';
import { notify } from './notifications';


export interface PersonWeek {
  stats: PeriodStats;
  bonuses: WeekBonuses | null;
  streak: Streak;
  /** The score with bonuses and call points. Never below zero. */
  score: number;
  paused: boolean;
  days: number;
}

/** The weeks each person has an approved pause for, as Mondays. */
export async function pausedWeeksFor(db: DbOrTx, userIds: string[]): Promise<Map<string, string[]>> {
  const paused = new Map<string, string[]>();
  if (!userIds.length) return paused;
  const rows = await db.select().from(streakPauses).where(and(inArray(streakPauses.userId, userIds), eq(streakPauses.status, 'approved')));
  for (const row of rows) {
    if (!row.fromWeek) continue;
    const weeks = Array.from({ length: row.weeks }, (_, week) => addDays(row.fromWeek!, week * 7));
    paused.set(row.userId, [...(paused.get(row.userId) ?? []), ...weeks]);
  }
  return paused;
}

/**
 * Everyone's standing as of a day: a fixed one when a week is being settled, or otherwise
 * today on each person's own calendar. Rankings and settling a crew's week both read this,
 * so the number on the screen is the number the match is decided by. Passing
 * recordedBefore ignores anything written after a week closed.
 */
export async function peopleOnDay(
  db: DbOrTx,
  people: { id: string; weeklyTarget: number; goalHistory: GoalChange[]; timeZone: string | null }[],
  period: Period,
  fixedDay: string | null,
  recordedBefore?: Date,
): Promise<Map<string, PersonWeek>> {
  const ids = people.map((person) => person.id);
  // A crew bonus depends on people who may not be in this table, so bring them in too.
  const memberships = await db.select({ crewId: crewMembers.crewId, userId: crewMembers.userId }).from(crewMembers).where(and(inArray(crewMembers.userId, ids), isNull(crewMembers.leftAt)));
  const crewIds = [...new Set(memberships.map((row) => row.crewId))];
  const fellows = crewIds.length
    ? await db.select({ crewId: crewMembers.crewId, userId: crewMembers.userId, weeklyTarget: users.weeklyTarget, goalHistory: users.goalHistory, timeZone: users.timeZone }).from(crewMembers)
      .innerJoin(users, eq(users.id, crewMembers.userId))
      .where(and(inArray(crewMembers.crewId, crewIds), isNull(crewMembers.leftAt)))
    : [];
  const everyone = [...new Set([...ids, ...fellows.map((row) => row.userId)])];
  const zones = new Map<string, string | null>([...fellows.map((row) => [row.userId, row.timeZone] as const), ...people.map((person) => [person.id, person.timeZone] as const)]);
  const dayOf = (userId: string) => fixedDay ?? dateIn(zones.get(userId));
  const workouts = (await db.select({ ownerId: loggedWorkouts.ownerId, date: loggedWorkouts.date, entries: loggedWorkouts.entries, recordedAt: loggedWorkouts.recordedAt })
    .from(loggedWorkouts)
    .where(and(inArray(loggedWorkouts.ownerId, everyone), eq(loggedWorkouts.deleted, false), recordedBefore ? lt(loggedWorkouts.recordedAt, recordedBefore) : undefined)))
    .filter((workout) => workout.date <= addDays(dayOf(workout.ownerId), 1));
  const paused = await pausedWeeksFor(db, everyone);
  const calls = await callPointsFor(db, ids, (userId) => ({ monday: mondayOf(dayOf(userId)), zone: zones.get(userId) ?? null }));

  const own = (userId: string) => workouts.filter((workout) => workout.ownerId === userId);
  const daysIn = (userId: string) => trainedDates(own(userId)).filter((date) => mondayOf(date) === mondayOf(dayOf(userId)) && date <= dayOf(userId)).length;
  const crewHit = new Map(crewIds.map((crewId) => {
    const active = fellows.filter((row) => row.crewId === crewId && !paused.get(row.userId)?.includes(mondayOf(dayOf(row.userId))));
    return [crewId, active.length >= 2 && active.every((row) => daysIn(row.userId) >= goalIn(goalsOf(row), dayOf(row.userId)))];
  }));
  const crewOf = new Map(memberships.map((row) => [row.userId, row.crewId]));

  return new Map(people.map((person) => {
    const mine = own(person.id);
    const day = dayOf(person.id);
    const goals = goalsOf(person);
    const stats = periodStats(mine, period, day);
    const pausedWeeks = paused.get(person.id) ?? [];
    const streak = weekStreak(trainedDates(mine), goals, day, pausedWeeks);
    const crewId = crewOf.get(person.id);
    const bonuses = period === 'week'
      ? weekBonuses(mine, goals, day, { pausedWeeks, crewHitGoal: crewId ? crewHit.get(crewId) ?? false : false, calls: calls.get(person.id) ?? 0 })
      : null;
    return [person.id, {
      stats, bonuses, streak, score: Math.max(0, stats.score + (bonuses?.total ?? 0)), paused: pausedWeeks.includes(mondayOf(day)), days: daysIn(person.id),
    }];
  }));
}

/** Only points, percentages and counts come out of here, so hidden weights stay hidden. */
export async function crewTable(db: DbOrTx, userId: string, period: Period): Promise<RankingRow[]> {
  const crew = [userId, ...(await friendIds(db, userId))];
  const people = await db.select().from(users).where(inArray(users.id, crew));
  const standing = await peopleOnDay(db, people, period, null);
  const now = new Date();

  const rows = people.map((person) => {
    const { stats, bonuses, streak, score } = standing.get(person.id)!;
    return {
      user: toPublic(person),
      rank: 0,
      target: person.weeklyTarget,
      wearingSandbag: person.sandbagUntil !== null && person.sandbagUntil > now,
      streak: streak.current,
      shields: streak.shields,
      ...stats,
      base: stats.score,
      bonuses,
      score,
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
    if (!recent) await notify(db, friendId, { title: 'Overtaken', body, route: 'rankings' });
  }
}

export function rankingRoutes(app: FastifyInstance, db: Db): void {
  app.get<{ Querystring: { period?: string } }>('/rankings', async (request): Promise<RankingRow[]> => {
    const user = await requireUser(db, request);
    const period = periodSchema.parse(request.query.period ?? 'week');
    await expireCalls(db, [user.id, ...(await friendIds(db, user.id))]);
    return crewTable(db, user.id, period);
  });
}
