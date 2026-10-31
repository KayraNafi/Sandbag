import { beatABest, TROPHIES, voice, weekStreak, type TrophyFacts, type TrophyView } from '@sandbag/shared';
import { and, eq, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, DbOrTx } from '../db/client';
import { loggedWorkouts, sandbagCalls, users, userTrophies } from '../db/schema';
import { requireUser } from './auth';
import { notify } from './notifications';
import { crewTable } from './rankings';

const MONTH_MS = 30 * 86_400_000;

async function factsFor(db: DbOrTx, user: { id: string; weeklyTarget: number }): Promise<TrophyFacts> {
  const workouts = await db.select({ date: loggedWorkouts.date, entries: loggedWorkouts.entries }).from(loggedWorkouts)
    .where(and(eq(loggedWorkouts.ownerId, user.id), eq(loggedWorkouts.deleted, false)));
  const calls = await db.select({ callerId: sandbagCalls.callerId, targetId: sandbagCalls.targetId, status: sandbagCalls.status }).from(sandbagCalls)
    .where(or(eq(sandbagCalls.targetId, user.id), eq(sandbagCalls.callerId, user.id)));
  const against = calls.filter((call) => call.targetId === user.id);
  const [{ joined } = { joined: 0 }] = await db.select({ joined: sql<number>`count(*)::int` }).from(users).where(eq(users.invitedBy, user.id));

  // Thirty days of real history, so nobody leads a month on their first afternoon.
  const today = new Date().toISOString().slice(0, 10);
  const earliest = workouts.reduce<string | null>((first, workout) => (first === null || workout.date < first ? workout.date : first), null);
  const longEnough = earliest !== null && Date.parse(`${today}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`) >= MONTH_MS;
  const table = longEnough ? await crewTable(db, user.id, 'month') : [];

  return {
    workouts: workouts.length,
    beatABest: beatABest(workouts),
    callsBeaten: against.filter((call) => call.status === 'cleared').length,
    callsAgainst: against.length,
    callsFailed: against.filter((call) => call.status === 'failed').length,
    callsWon: calls.filter((call) => call.callerId === user.id && call.status === 'failed').length,
    joined,
    bestStreak: weekStreak(workouts.map((workout) => workout.date), user.weeklyTarget, today).best,
    ledTheMonth: table.length > 1 && table.find((row) => row.user.id === user.id)?.rank === 1,
  };
}

/** Awards anything newly earned, as one notification however many arrive together. */
export async function awardTrophies(db: DbOrTx, user: { id: string; weeklyTarget: number }): Promise<TrophyFacts> {
  const facts = await factsFor(db, user);
  const earned = TROPHIES.filter((trophy) => trophy.value(facts) >= trophy.goal);
  const fresh = [];
  for (const trophy of earned) {
    const [row] = await db.insert(userTrophies).values({ userId: user.id, trophyId: trophy.id }).onConflictDoNothing().returning();
    if (row) fresh.push(trophy);
  }
  const [only] = fresh;
  if (only) {
    await notify(db, user.id, {
      title: 'Trophy unlocked',
      body: fresh.length === 1 ? voice.trophy(only.name) : voice.trophies(fresh.length),
      route: 'trophies',
    });
  }
  return facts;
}

export function trophyRoutes(app: FastifyInstance, db: Db): void {
  app.get('/trophies', async (request): Promise<TrophyView[]> => {
    const user = await requireUser(db, request);
    const facts = await awardTrophies(db, user);
    const rows = await db.select().from(userTrophies).where(eq(userTrophies.userId, user.id));
    const earnedAt = new Map(rows.map((row) => [row.trophyId, row.earnedAt.toISOString()]));
    return TROPHIES.map((trophy) => ({
      id: trophy.id,
      name: trophy.name,
      detail: trophy.detail,
      goal: trophy.goal,
      progress: Math.min(trophy.value(facts), trophy.goal),
      earnedAt: earnedAt.get(trophy.id) ?? null,
    }));
  });
}
