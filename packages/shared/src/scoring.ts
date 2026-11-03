import type { Entry, Period } from './schemas';
import { entryMax, entrySetup, hasWork } from './strength';
import { DAY_MS, daysBetween, dayOfWeek } from './time';

export const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30 };

const MAX_POINTS = 100;
/** How far one lift can move the average either way, so one bad number can't decide a score. */
const MAX_LIFT_CHANGE = 25;
/** What a lift can gain with this few sessions behind it, so a low first log isn't an easy +25%. */
const NEW_LIFT_CHANGE = [5, 5, 10];
/** Your best of these days before the period is the number to beat, so a tanked week can't set up an easy gain. */
const BASELINE_DAYS = 28;
/** The app can backfill a week. A number written down later than this can't be anyone's best. */
const MAX_BACKDATE_DAYS = 8;
/** Consistency is measured against at least this many days a week, so a goal of 1 can't be full marks. */
const MIN_GOAL = 3;

/** Days a period has run so far, today included: this week since Monday, or the last 30 days. */
export const periodDays = (period: Period, today: string) => (period === 'week' ? dayOfWeek(today) : PERIOD_DAYS[period]);

export interface ScoringWorkout {
  date: string;
  /** When the server last saw these numbers change. Phones can't set it. */
  recordedAt?: Date | null;
  entries: Entry[];
}

export interface PeriodStats {
  progress: number;
  workouts: number;
  consistency: number;
  score: number;
}

export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const roundOne = (value: number) => Math.round(value * 10) / 10;

/** The days someone really trained, once each however many sessions a day held. */
export function trainedDates(workouts: Pick<ScoringWorkout, 'date' | 'entries'>[]): string[] {
  return [...new Set(workouts.filter((workout) => workout.entries.some(hasWork)).map((workout) => workout.date))];
}

/** Written up long after the day it claims, so it can't set a best or a baseline. */
function backdated(workout: ScoringWorkout): boolean {
  return workout.recordedAt != null && workout.recordedAt.getTime() - Date.parse(`${workout.date}T00:00:00Z`) > MAX_BACKDATE_DAYS * DAY_MS;
}

/**
 * Raw weight is unfair across gyms and machines, so progress is the average change in
 * estimated strength per lift, against that person's own best of the weeks before.
 * Each lift counts its best session of the period, so a light day costs nothing, and
 * only lifts done in the period count. The week is Monday to Sunday.
 */
export function periodStats(workouts: ScoringWorkout[], period: Period, weeklyTarget: number, today: string): PeriodStats {
  const days = periodDays(period, today);
  const ordered = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  // Dates are the phone's local date, which can be a day ahead of the server's.
  const inPeriod = (date: string) => daysBetween(date, today) < days && daysBetween(date, today) >= -1;
  const inBaseline = (date: string) => daysBetween(date, today) >= days && daysBetween(date, today) < days + BASELINE_DAYS;

  const logs = new Map<string, { date: string; max: number; setup: string; trusted: boolean }[]>();
  for (const workout of ordered) {
    for (const entry of workout.entries) {
      const max = entryMax(entry);
      if (max === null) continue;
      const key = exerciseKey(entry.name);
      logs.set(key, [...(logs.get(key) ?? []), { date: workout.date, max, setup: entrySetup(entry), trusted: !backdated(workout) }]);
    }
  }

  const changes: number[] = [];
  for (const log of logs.values()) {
    const latest = log.filter((item) => inPeriod(item.date)).at(-1);
    if (!latest) continue;
    // Only weights weighed the same way compare.
    const alike = log.filter((item) => item.setup === latest.setup && item.trusted);
    const before = alike.filter((item) => daysBetween(item.date, today) >= days);
    const recent = before.filter((item) => inBaseline(item.date));
    const during = alike.filter((item) => inPeriod(item.date));
    if (!during.length) continue;
    // With no history, the period's first session is the baseline and its best the result.
    const base = recent.length ? Math.max(...recent.map((item) => item.max)) : before.at(-1)?.max ?? during[0]!.max;
    const best = Math.max(...during.map((item) => item.max));
    const change = ((best - base) / base) * 100;
    changes.push(Math.max(-MAX_LIFT_CHANGE, Math.min(NEW_LIFT_CHANGE[before.length] ?? MAX_LIFT_CHANGE, change)));
  }

  const progress = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : 0;
  const count = trainedDates(ordered.filter((workout) => inPeriod(workout.date))).length;
  const consistency = Math.min(MAX_POINTS, Math.round((count / ((Math.max(weeklyTarget, MIN_GOAL) * PERIOD_DAYS[period]) / 7)) * 100));
  // A square root, so a real +2.5 kg counts for plenty and only a big jump reaches the top.
  const progressPoints = Math.min(MAX_POINTS, Math.sqrt(Math.max(0, progress) / MAX_LIFT_CHANGE) * MAX_POINTS);
  return { progress: roundOne(progress), workouts: count, consistency, score: Math.round((progressPoints + consistency) / 2) };
}

export const INVITE_GOALS = [
  { count: 3, name: 'Recruiter' },
  { count: 10, name: 'Crew boss' },
  { count: 25, name: 'Cult leader' },
] as const;

export function nextInviteGoal(joined: number): { count: number; name: string } | null {
  return INVITE_GOALS.find((goal) => goal.count > joined) ?? null;
}

const weekOf = (iso: string) => Math.floor((Date.parse(`${iso}T00:00:00Z`) / DAY_MS + 3) / 7);

export interface Streak {
  current: number;
  best: number;
}

/**
 * Weeks in a row, Monday to Sunday, that hit the weekly target. The week in
 * progress adds to a streak once it's met, and can't break one until it's over.
 */
export function weekStreak(dates: string[], weeklyTarget: number, today: string): Streak {
  const counts = new Map<number, number>();
  // Two sessions on one day are one day trained.
  for (const date of new Set(dates)) counts.set(weekOf(date), (counts.get(weekOf(date)) ?? 0) + 1);
  const met = (week: number) => (counts.get(week) ?? 0) >= weeklyTarget;

  const thisWeek = weekOf(today);
  let current = 0;
  for (let week = met(thisWeek) ? thisWeek : thisWeek - 1; met(week); week -= 1) current += 1;

  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const week of [...counts.keys()].filter(met).sort((a, b) => a - b)) {
    run = previous !== null && week === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = week;
  }
  return { current, best };
}

export interface TrophyFacts {
  workouts: number;
  beatABest: boolean;
  callsBeaten: number;
  callsAgainst: number;
  callsFailed: number;
  callsWon: number;
  joined: number;
  bestStreak: number;
  ledTheMonth: boolean;
}

/** Once earned they stay earned, so a bad month can't take one away. */
export const TROPHIES: { id: string; name: string; detail: string; goal: number; value: (facts: TrophyFacts) => number }[] = [
  { id: 'showed_up', name: 'Showed up', detail: 'Log 3 workouts', goal: 3, value: (facts) => facts.workouts },
  { id: 'actually_tried', name: 'Actually tried', detail: 'Set a new best', goal: 1, value: (facts) => Number(facts.beatABest) },
  { id: 'not_guilty', name: 'Not guilty', detail: 'Beat a sandbag call', goal: 1, value: (facts) => facts.callsBeaten },
  { id: 'caught', name: 'Caught', detail: 'Fail a sandbag call', goal: 1, value: (facts) => facts.callsFailed },
  { id: 'good_eye', name: 'Good eye', detail: 'Call someone who then fails it', goal: 1, value: (facts) => facts.callsWon },
  { id: 'repeat_offender', name: 'Repeat offender', detail: 'Get called out 5 times', goal: 5, value: (facts) => facts.callsAgainst },
  { id: 'four_weeks', name: 'Four weeks clean', detail: 'Hit your target 4 weeks running', goal: 4, value: (facts) => facts.bestStreak },
  { id: 'crew_leader', name: 'Crew leader', detail: 'Top your crew over 30 days', goal: 1, value: (facts) => Number(facts.ledTheMonth) },
  ...INVITE_GOALS.map((goal) => ({
    id: `invites_${goal.count}`, name: goal.name, detail: `${goal.count} friends join through you`, goal: goal.count, value: (facts: TrophyFacts) => facts.joined,
  })),
];

/** True when a later session of any lift beat everything before it. */
export function beatABest(workouts: ScoringWorkout[]): boolean {
  const best = new Map<string, number>();
  for (const workout of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const entry of workout.entries) {
      const max = entryMax(entry);
      if (max === null) continue;
      const key = exerciseKey(entry.name);
      const previous = best.get(key);
      if (previous !== undefined && max > previous) return true;
      best.set(key, Math.max(previous ?? 0, max));
    }
  }
  return false;
}
