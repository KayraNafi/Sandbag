import type { Entry, Period } from './schemas';

export const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30 };

/** Starting values, to tune with real use: +1% progress earns 10 points. */
const POINTS_PER_PERCENT = 10;
const MAX_POINTS = 100;
/** How far one lift can move the average either way, so one bad number can't decide a score. */
const MAX_LIFT_CHANGE = 25;

export interface ScoringWorkout {
  date: string;
  entries: Pick<Entry, 'name' | 'kind' | 'weight'>[];
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

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

const roundOne = (value: number) => Math.round(value * 10) / 10;

/**
 * Raw weight is unfair across gyms and machines, so progress is the average %
 * change per exercise against that person's own number before the period.
 */
export function periodStats(workouts: ScoringWorkout[], period: Period, weeklyTarget: number, today: string): PeriodStats {
  const days = PERIOD_DAYS[period];
  const ordered = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  // Dates are the phone's local date, which can be a day ahead of the server's.
  const inPeriod = (date: string) => daysBetween(date, today) < days && daysBetween(date, today) >= -1;

  const logs = new Map<string, { date: string; weight: number }[]>();
  for (const workout of ordered) {
    for (const entry of workout.entries) {
      if (entry.kind !== 'strength' || !entry.weight) continue;
      const key = exerciseKey(entry.name);
      const log = logs.get(key) ?? [];
      log.push({ date: workout.date, weight: entry.weight });
      logs.set(key, log);
    }
  }

  const changes: number[] = [];
  for (const log of logs.values()) {
    const recent = log.filter((item) => inPeriod(item.date));
    const latest = recent.at(-1);
    if (!latest) continue;
    const base = log.filter((item) => daysBetween(item.date, today) >= days).at(-1) ?? recent[0];
    if (!base || base === latest) continue;
    const change = ((latest.weight - base.weight) / base.weight) * 100;
    changes.push(Math.max(-MAX_LIFT_CHANGE, Math.min(MAX_LIFT_CHANGE, change)));
  }

  const progress = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : 0;
  const count = ordered.filter((workout) => inPeriod(workout.date)).length;
  const consistency = Math.min(MAX_POINTS, Math.round((count / ((weeklyTarget * days) / 7)) * 100));
  const progressPoints = Math.min(MAX_POINTS, Math.max(0, progress * POINTS_PER_PERCENT));
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

const weekOf = (iso: string) => Math.floor((Date.parse(`${iso}T00:00:00Z`) / 86_400_000 + 3) / 7);

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
  for (const date of dates) counts.set(weekOf(date), (counts.get(weekOf(date)) ?? 0) + 1);
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
      if (entry.kind !== 'strength' || !entry.weight) continue;
      const key = exerciseKey(entry.name);
      const previous = best.get(key);
      if (previous !== undefined && entry.weight > previous) return true;
      best.set(key, Math.max(previous ?? 0, entry.weight));
    }
  }
  return false;
}
