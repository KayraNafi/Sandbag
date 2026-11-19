import { dateIn, voice } from '@sandbag/shared';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { loggedWorkouts, notifications, runs, users } from '../db/schema';
import { notify } from './notifications';

/** A month's Wrapped is announced in the first days of the next, so a server that was down on the 1st still gets there. */
const WINDOW_DAYS = 7;
/** Nobody wants their phone buzzing at midnight, so it waits for the morning where they are. */
const FROM_HOUR = 9;
const CHECK_MS = 30 * 60 * 1000;

const hourIn = (timeZone: string | null, at: Date): number => {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: timeZone ?? 'UTC', hour: '2-digit', hourCycle: 'h23' }).format(at));
  } catch {
    return at.getUTCHours();
  }
};

/** The month just ended where someone is, as YYYY-MM, once it's time to tell them. Null the rest of the month. */
export function wrappedMonthFor(timeZone: string | null, now: Date): string | null {
  const today = dateIn(timeZone, now);
  if (Number(today.slice(8)) > WINDOW_DAYS || hourIn(timeZone, now) < FROM_HOUR) return null;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

const nextMonth = (month: string) => {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5));
  return number === 12 ? `${year + 1}-01-01` : `${year}-${String(number + 1).padStart(2, '0')}-01`;
};

const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });

/** Tells everyone whose month just ended and had a session or a run in it, once. Returns how many it told. */
export async function announceWrapped(db: Db, now: Date = new Date()): Promise<number> {
  const everyone = await db.select({ id: users.id, timeZone: users.timeZone }).from(users);
  let told = 0;
  for (const person of everyone) {
    const month = wrappedMonthFor(person.timeZone, now);
    if (!month) continue;
    const route = `wrapped/${month}`;
    const from = `${month}-01`;
    const to = nextMonth(month);
    await db.transaction(async (tx) => {
      const [already] = await tx.select({ id: notifications.id }).from(notifications)
        .where(and(eq(notifications.userId, person.id), eq(notifications.kind, 'wrapped'), eq(notifications.route, route))).limit(1);
      if (already) return;
      const [session] = await tx.select({ one: sql`1` }).from(loggedWorkouts)
        .where(and(eq(loggedWorkouts.ownerId, person.id), eq(loggedWorkouts.deleted, false), gte(loggedWorkouts.date, from), lt(loggedWorkouts.date, to))).limit(1);
      const [run] = session ? [] : await tx.select({ one: sql`1` }).from(runs)
        .where(and(eq(runs.ownerId, person.id), eq(runs.deleted, false), gte(runs.date, from), lt(runs.date, to))).limit(1);
      if (!session && !run) return;
      await notify(tx, person.id, { kind: 'wrapped', title: `Your ${monthName(month)} Wrapped is ready`, body: voice.wrappedReady(), route });
      told += 1;
    });
  }
  return told;
}

/** Checks twice an hour, which is plenty: each person is told once per month whenever it runs. Returns a stop. */
export function startAnnouncingWrapped(db: Db, onError: (error: unknown) => void): () => void {
  let running = false;
  const check = () => {
    if (running) return;
    running = true;
    announceWrapped(db).catch(onError).finally(() => { running = false; });
  };
  check();
  const timer = setInterval(check, CHECK_MS);
  return () => clearInterval(timer);
}
