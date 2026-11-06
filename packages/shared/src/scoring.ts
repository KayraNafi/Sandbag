import { weekRunning, type ScoringRun } from './running';
import type { Entry, Period } from './schemas';
import { entryMax, entrySetup, hasWork } from './strength';
import { addDays, DAY_MS, daysBetween, dayOfWeek, mondayOf } from './time';

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

/** A goal someone set, from the Monday it took effect. */
export interface GoalChange {
  from: string;
  goal: number;
}

/** One goal for all time, or the goals someone has had, oldest first. */
export type Goals = number | readonly GoalChange[];

/** The goal for the week holding a date, so changing it can't rewrite the weeks behind you. */
export function goalIn(goals: Goals, iso: string): number {
  if (typeof goals === 'number') return goals;
  let goal = goals[0]?.goal ?? MIN_GOAL;
  for (const change of goals) if (change.from <= iso) goal = change.goal;
  return goal;
}

/** Before anyone changed a goal: a Monday from before the app existed. */
const SINCE_THE_START = '2000-01-03';

/**
 * A new goal starts next Monday: the week under way keeps the goal it began with, so it can't be
 * lowered on a Sunday to save a streak, and the weeks behind you stay as they were. With nothing
 * logged yet there's nothing to protect, so it applies straight away.
 */
export function changeGoal(user: { weeklyTarget: number; goalHistory: readonly GoalChange[] }, goal: number, today: string, trainedYet: boolean): GoalChange[] {
  if (!trainedYet) return [];
  if (goal === user.weeklyTarget) return [...user.goalHistory];
  const from = addDays(mondayOf(today), 7);
  const history = user.goalHistory.length ? user.goalHistory : [{ from: SINCE_THE_START, goal: user.weeklyTarget }];
  return [...history.filter((change) => change.from < from), { from, goal }];
}

/** A profile cached by an older app has no history, which means the one goal all along. */
export const goalsOf = (user: { weeklyTarget: number; goalHistory?: readonly GoalChange[] }): Goals => (user.goalHistory?.length ? user.goalHistory : user.weeklyTarget);

/** Days a period has run so far, today included: this week since Monday, or the last 30 days. */
export const periodDays = (period: Period, today: string) => (period === 'week' ? dayOfWeek(today) : PERIOD_DAYS[period]);

export interface ScoringWorkout {
  date: string;
  /** When the server last saw these numbers change. Phones can't set it. */
  recordedAt?: Date | null;
  entries: Entry[];
}

/** Everything a week's score reads: sessions in the gym, and runs and walks. */
export interface Training {
  workouts: ScoringWorkout[];
  runs: ScoringRun[];
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
export function periodStats(workouts: ScoringWorkout[], period: Period, goals: Goals, today: string): PeriodStats {
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
  const consistency = Math.min(MAX_POINTS, Math.round((count / ((Math.max(goalIn(goals, today), MIN_GOAL) * PERIOD_DAYS[period]) / 7)) * 100));
  // A square root, so a real +2.5 kg counts for plenty and only a big jump reaches the top.
  const progressPoints = Math.min(MAX_POINTS, Math.sqrt(Math.max(0, progress) / MAX_LIFT_CHANGE) * MAX_POINTS);
  return { progress: roundOne(progress), workouts: count, consistency, score: Math.round((progressPoints + consistency) / 2) };
}

/** A week's points as the This week ranking shows them: the gym score, its bonuses, running and call points, never below nothing. */
export function weekScore({ workouts, runs }: Training, goals: Goals, today: string, callPoints: number): number {
  const gym = periodStats(workouts, 'week', goals, today).score + weekBonuses(workouts, goals, today).total;
  return Math.max(0, gym + weekRunning(runs, today).points + callPoints);
}

/**
 * Every week since the first workout or run, each scored as it stood on its Sunday, added up.
 * Call points come capped, by Monday. The week still running counts what it has so far.
 */
export function allTimeScore({ workouts, runs }: Training, goals: Goals, today: string, callsByWeek: ReadonlyMap<string, number>): number {
  // A call can count before someone's first workout: callers don't have to lift, and runners don't either.
  const first = [...workouts.map((workout) => workout.date), ...runs.map((run) => run.date), ...callsByWeek.keys()].sort()[0];
  if (!first) return 0;
  let total = 0;
  for (let monday = mondayOf(first); monday <= today; monday = addDays(monday, 7)) {
    const sunday = addDays(monday, 6);
    const end = sunday < today ? sunday : today;
    const sofar = { workouts: workouts.filter((workout) => workout.date <= end), runs: runs.filter((run) => run.date <= end) };
    total += weekScore(sofar, goals, end, callsByWeek.get(monday) ?? 0);
  }
  return total;
}

export const INVITE_GOALS = [
  { count: 3, name: 'Recruiter' },
  { count: 10, name: 'Crew boss' },
  { count: 25, name: 'Cult leader' },
] as const;

export function nextInviteGoal(joined: number): { count: number; name: string } | null {
  return INVITE_GOALS.find((goal) => goal.count > joined) ?? null;
}

export interface Streak {
  current: number;
  best: number;
  /** Missed weeks the streak can survive. */
  shields: number;
}

/** Every fourth week on target earns a shield, and a few can be held. */
export const WEEKS_PER_SHIELD = 4;
export const MAX_SHIELDS = 2;

/**
 * Weeks in a row, Monday to Sunday, that hit the goal of their time. The week in progress
 * adds to a streak once it's met, and can't break one until it's over. A missed week
 * spends a shield if there is one, and otherwise ends the streak.
 */
export function weekStreak(dates: string[], goals: Goals, today: string): Streak {
  const days = new Map<string, number>();
  for (const date of new Set(dates)) days.set(mondayOf(date), (days.get(mondayOf(date)) ?? 0) + 1);
  const thisWeek = mondayOf(today);
  const first = [...days.keys()].sort()[0];

  let current = 0;
  let best = 0;
  let shields = 0;
  let earning = 0;
  for (let week = first; week !== undefined && week <= thisWeek; week = addDays(week, 7)) {
    if ((days.get(week) ?? 0) >= goalIn(goals, week)) {
      current += 1;
      best = Math.max(best, current);
      earning += 1;
      if (earning === WEEKS_PER_SHIELD) {
        earning = 0;
        shields = Math.min(MAX_SHIELDS, shields + 1);
      }
    } else if (week < thisWeek) {
      if (shields) {
        shields -= 1;
      } else {
        current = 0;
        earning = 0;
      }
    }
  }
  return { current, best, shields };
}

/** All of a week's bonuses together can't add more than this, so habits never outweigh training. */
export const MAX_WEEK_BONUS = 15;
/** Streak lengths that pay, longest first, and what each pays by goal. Bigger goals earn a little more. */
const STREAK_WEEKS = [12, 8, 4, 2];
const STREAK_PAY: Record<number, number[]> = { 2: [4, 3, 2, 1], 3: [6, 4, 3, 1], 4: [8, 6, 4, 2] };
const COMEBACK_BONUS = 3;
const OVER_GOAL_BONUS = 2;
const NEW_BEST_BONUS = 2;
const MAX_NEW_BESTS = 3;
/** One earlier session is a coincidence. Two make a number worth beating. */
const NEW_BEST_HISTORY = 2;

export function streakBonus(weeks: number, goal: number): number {
  const tier = STREAK_WEEKS.findIndex((length) => weeks >= length);
  return tier < 0 ? 0 : STREAK_PAY[Math.min(Math.max(goal, 2), 4)]![tier]!;
}

export interface WeekBonuses {
  streak: number;
  comeback: number;
  overGoal: number;
  newBests: number;
  total: number;
}

/** Extra points this week for showing up: a streak, a comeback, more days than the goal, and new bests. */
export function weekBonuses(workouts: ScoringWorkout[], goals: Goals, today: string): WeekBonuses {
  const dates = trainedDates(workouts).filter((date) => date <= today);
  const thisWeek = mondayOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const daysIn = (monday: string) => dates.filter((date) => mondayOf(date) === monday).length;
  const goal = goalIn(goals, thisWeek);
  const days = daysIn(thisWeek);

  const streak = streakBonus(weekStreak(dates, goals, today).current, goal);
  // Only after a week really missed, by someone who trained before it.
  const comeback = days >= goal && daysIn(lastWeek) < goalIn(goals, lastWeek) && dates.some((date) => date < lastWeek) ? COMEBACK_BONUS : 0;
  const overGoal = days > goal ? OVER_GOAL_BONUS : 0;

  // Lifts that beat everything before them this week, weighed the same way.
  const bests = new Map<string, { max: number; sessions: number }>();
  const beaten = new Set<string>();
  for (const workout of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    if (workout.date > today || backdated(workout)) continue;
    // A lift logged twice in one session is still one session of history.
    const session = new Map<string, { lift: string; max: number }>();
    for (const entry of workout.entries) {
      const max = entryMax(entry);
      if (max === null) continue;
      const lift = exerciseKey(entry.name);
      const key = `${lift}|${entrySetup(entry)}`;
      session.set(key, { lift, max: Math.max(session.get(key)?.max ?? 0, max) });
    }
    for (const [key, { lift, max }] of session) {
      const best = bests.get(key) ?? { max: 0, sessions: 0 };
      if (workout.date >= thisWeek && best.sessions >= NEW_BEST_HISTORY && max > best.max) beaten.add(lift);
      bests.set(key, { max: Math.max(best.max, max), sessions: best.sessions + 1 });
    }
  }
  const newBests = Math.min(MAX_NEW_BESTS, beaten.size) * NEW_BEST_BONUS;
  return { streak, comeback, overGoal, newBests, total: Math.min(MAX_WEEK_BONUS, streak + comeback + overGoal + newBests) };
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
