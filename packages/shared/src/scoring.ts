import { catalogEntry, exerciseKey, type Equipment } from './exercises';
import type { Entry, Period } from './schemas';

export const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30 };

const MAX_POINTS = 100;
/** How far one lift can move the average either way, so one bad number can't decide a score. */
const MAX_LIFT_CHANGE = 25;
/** What a lift can gain with this few sessions behind it, so a low first log isn't an easy +25%. */
const NEW_LIFT_CHANGE = [5, 5, 10];
/** Four days a week is full marks, whatever goal someone set themselves. */
const FULL_DAYS_A_WEEK = 4;
/** Your recent best is the number to beat, so a tanked week can't set up an easy gain. */
const BASELINE_DAYS = 28;
/** The app can backfill a week. A number written later than this can't be anyone's baseline. */
const MAX_BACKDATE_DAYS = 8;
/** Estimates get unreliable past this, and 50 light reps shouldn't look like a heavy single. */
const MAX_ESTIMATE_REPS = 12;
const DAY_MS = 86_400_000;

type ScoringEntry = Pick<Entry, 'name' | 'kind' | 'weight'>
  & Partial<Pick<Entry, 'perSide' | 'includesEquipment' | 'reps' | 'setReps' | 'setWeights' | 'minutes'>>;

export interface ScoringWorkout {
  date: string;
  /** When the server last saw these numbers change. Phones can't set it. */
  recordedAt?: Date | string | null;
  entries: ScoringEntry[];
}

export interface PeriodStats {
  progress: number;
  workouts: number;
  consistency: number;
  score: number;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

const roundOne = (value: number) => Math.round(value * 10) / 10;

/** Days so far in today's Monday to Sunday week, the same week weekStreak uses. */
const daysThisWeek = (today: string) => ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const mondayOf = (iso: string) => addDays(iso, 1 - daysThisWeek(iso));

const zoneFormats = new Map<string, Intl.DateTimeFormat>();

/** The date on someone's own calendar, so their week ends at their midnight. Unknown zones fall back to UTC. */
export function dateIn(timeZone: string | null | undefined, at: Date = new Date()): string {
  if (!timeZone) return at.toISOString().slice(0, 10);
  try {
    const format = zoneFormats.get(timeZone) ?? new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    zoneFormats.set(timeZone, format);
    const part = (type: string) => format.formatToParts(at).find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export interface GoalChange {
  /** The Monday this goal starts from. */
  from: string;
  goal: number;
}

/** One goal, or the goals someone has had over time, oldest first. */
export type Goals = number | readonly GoalChange[];

/** The goal that applied in a given week, so changing it today can't rewrite the weeks already behind you. */
export function goalIn(goals: Goals, iso: string): number {
  if (typeof goals === 'number') return goals;
  return [...goals].reverse().find((change) => change.from <= iso)?.goal ?? goals[0]?.goal ?? 3;
}

export const goalsOf = (user: { weeklyTarget: number; goalHistory?: readonly GoalChange[] | null }): Goals => (user.goalHistory?.length ? user.goalHistory : user.weeklyTarget);

/** Strength from weight and reps. Effort is left out on purpose: claiming RPE 6 mustn't raise a score. */
export function estimatedMax(weight: number, reps: number | null | undefined): number {
  return weight * (1 + (Math.min(reps || 1, MAX_ESTIMATE_REPS) - 1) / 30);
}

/** Above the all-time records on purpose, so nobody real is ever accused. Past these it's a joke or a typo. */
const BELIEVABLE_MAX: Record<Equipment, number> = { barbell: 700, dumbbell: 400, machine: 1500, cable: 500, bodyweight: 300 };
const BELIEVABLE_CUSTOM_MAX = 1500;
/** 500 kg for 40 reps, in one set. */
const BELIEVABLE_SET_KG = 20_000;

/** Whether one set could have happened. Zero reps can't: holding a bar isn't lifting it. No reps recorded is fine. */
export function believableSet(entry: Pick<ScoringEntry, 'name' | 'perSide'>, weight: number, reps: number | null | undefined): boolean {
  if (reps === 0) return false;
  const total = weight * (entry.perSide ? 2 : 1);
  const equipment = catalogEntry(entry.name)?.equipment;
  return estimatedMax(total, reps) <= (equipment ? BELIEVABLE_MAX[equipment] : BELIEVABLE_CUSTOM_MAX) && total * (reps ?? 1) <= BELIEVABLE_SET_KG;
}

/** The best believable set of an entry, or null when it holds no weight worth comparing. */
export function entryMax(entry: ScoringEntry): number | null {
  if (entry.kind !== 'strength' || !entry.weight) return null;
  const weights = entry.setWeights?.some(Boolean) ? entry.setWeights : [entry.weight];
  const best = weights.reduce<number>((top, weight, set) => {
    const reps = entry.setReps?.[set] ?? entry.reps;
    if (!weight || !believableSet(entry, weight, reps)) return top;
    return Math.max(top, estimatedMax(weight, reps));
  }, 0);
  return best || null;
}

/** The strongest of these entries. A session can hold a lift twice, and the warm-up isn't the one that counts. */
export function topEntry<T extends ScoringEntry>(entries: T[]): { entry: T; max: number } | null {
  let top: { entry: T; max: number } | null = null;
  for (const entry of entries) {
    const max = entryMax(entry);
    if (max !== null && (!top || max > top.max)) top = { entry, max };
  }
  return top;
}

/** Weights only compare when they were weighed the same way: per side or total, with or without the bar. */
export const entrySetup = (entry: Pick<ScoringEntry, 'perSide' | 'includesEquipment'>) => `${entry.perSide ?? false}/${entry.includesEquipment}`;

/** A name alone proves nothing, and neither does a joke. It takes a believable number to count as training. */
export function hasWork(entry: ScoringEntry): boolean {
  if (entry.kind === 'time') return Boolean(entry.minutes);
  return entry.weight ? entryMax(entry) !== null : Boolean(entry.reps || entry.setReps?.some(Boolean));
}

/** The days someone really trained, one per date however many sessions it held. */
export function trainedDates(workouts: ScoringWorkout[]): string[] {
  return [...new Set(workouts.filter((workout) => workout.entries.some(hasWork)).map((workout) => workout.date))];
}

function isBackdated(workout: ScoringWorkout): boolean {
  if (!workout.recordedAt) return false;
  return new Date(workout.recordedAt).getTime() - Date.parse(`${workout.date}T00:00:00Z`) > MAX_BACKDATE_DAYS * DAY_MS;
}

/**
 * Raw weight is unfair across gyms and machines, so progress is the average %
 * change in estimated strength per exercise against that person's own recent
 * best. What counts is your best of the period, not its last session, so a light
 * day after a heavy one costs nothing. A lift you stopped doing counts as no gain
 * once the period is over, so dropping the ones going badly doesn't help.
 */
export function periodStats(workouts: ScoringWorkout[], period: Period, today: string): PeriodStats {
  const days = PERIOD_DAYS[period];
  const windowDays = period === 'week' ? daysThisWeek(today) : days;
  const ordered = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  // Dates are the phone's local date, which can be a day ahead of the server's.
  const inPeriod = (date: string) => daysBetween(date, today) < windowDays && daysBetween(date, today) >= -1;
  const inBaseline = (date: string) => daysBetween(date, today) >= windowDays && daysBetween(date, today) < windowDays + BASELINE_DAYS;

  const logs = new Map<string, { date: string; max: number; setup: string; trusted: boolean }[]>();
  for (const workout of ordered) {
    for (const entry of workout.entries) {
      const max = entryMax(entry);
      if (max === null) continue;
      const key = exerciseKey(entry.name);
      const log = logs.get(key) ?? [];
      log.push({ date: workout.date, max, setup: entrySetup(entry), trusted: !isBackdated(workout) });
      logs.set(key, log);
    }
  }

  const finished = windowDays === days;
  const changes: number[] = [];
  for (const log of logs.values()) {
    const latest = log.filter((item) => inPeriod(item.date)).at(-1);
    if (!latest) {
      if (finished && log.filter((item) => item.trusted && inBaseline(item.date)).length >= 2) changes.push(0);
      continue;
    }
    const sameSetup = log.filter((item) => item.setup === latest.setup);
    const before = sameSetup.filter((item) => item.trusted && daysBetween(item.date, today) >= windowDays);
    const recent = before.filter((item) => inBaseline(item.date));
    const base = recent.length ? Math.max(...recent.map((item) => item.max)) : before.at(-1)?.max;
    const thisPeriod = sameSetup.filter((item) => inPeriod(item.date));
    const first = thisPeriod[0];
    if (base === undefined && (!first || first === latest)) continue;
    const from = base ?? first!.max;
    // Written up long after the day, it can't be anyone's best: the same rule as the baseline.
    const counted = thisPeriod.filter((item) => item.trusted);
    const best = Math.max(...(counted.length ? counted : [latest]).map((item) => item.max));
    const change = ((best - from) / from) * 100;
    changes.push(Math.max(-MAX_LIFT_CHANGE, Math.min(NEW_LIFT_CHANGE[before.length] ?? MAX_LIFT_CHANGE, change)));
  }

  const progress = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : 0;
  const count = trainedDates(ordered.filter((workout) => inPeriod(workout.date))).length;
  const consistency = Math.min(MAX_POINTS, Math.round((count / ((FULL_DAYS_A_WEEK * days) / 7)) * 100));
  // A square root, so a real +2.5 kg counts for plenty and the top of the range still pays.
  const progressPoints = Math.min(MAX_POINTS, Math.sqrt(Math.max(0, progress) / MAX_LIFT_CHANGE) * MAX_POINTS);
  return { progress: roundOne(progress), workouts: count, consistency, score: Math.round((progressPoints + consistency) / 2) };
}

export type CallStatus = 'open' | 'cleared' | 'failed' | 'watching' | 'honest' | 'confirmed';

/** How close a miss has to be, at full effort, to count as honest. */
const HONEST_MARGIN = 0.05;
const HONEST_RPE = 9;
export const CALL_DAYS = 14;
export const WATCH_DAYS = 14;
/** A week's calls can only move a score so far, so two friends can't trade points to win. */
export const MAX_CALL_POINTS = 10;

/**
 * Beat the called number on your next session of that lift. Falling just short at
 * full effort isn't sandbagging, so it's watched rather than punished: see overHonestMiss.
 */
export function resolveCall(targetMax: number, loggedMax: number, rpe?: number | null): 'cleared' | 'failed' | 'watching' {
  if (loggedMax > targetMax) return 'cleared';
  return loggedMax >= targetMax * (1 - HONEST_MARGIN) && (rpe ?? 0) >= HONEST_RPE ? 'watching' : 'failed';
}

/** Lifting well past it soon after saying that was your limit is what sandbagging looks like. */
export const overHonestMiss = (targetMax: number, loggedMax: number) => loggedMax >= targetMax * (1 + HONEST_MARGIN);

/** What a settled call is worth. Both sides have something riding on it. */
export function callPoints(status: CallStatus, role: 'target' | 'caller'): number {
  if (status === 'cleared') return role === 'target' ? 5 : -3;
  if (status === 'failed') return role === 'target' ? -5 : 5;
  if (status === 'confirmed') return role === 'target' ? -10 : 10;
  return 0;
}

export const SANDBAG_BADGE_DAYS = 7;
/** How many calls one person can have waiting on a verdict. */
export const MAX_OPEN_CALLS = 3;

export const INVITE_GOALS = [
  { count: 3, name: 'Recruiter' },
  { count: 10, name: 'Crew boss' },
  { count: 25, name: 'Cult leader' },
] as const;

export function nextInviteGoal(joined: number): { count: number; name: string } | null {
  return INVITE_GOALS.find((goal) => goal.count > joined) ?? null;
}

const weekOf = (iso: string) => Math.floor((Date.parse(`${iso}T00:00:00Z`) / DAY_MS + 3) / 7);
const mondayOfWeek = (week: number) => new Date((week * 7 - 3) * DAY_MS).toISOString().slice(0, 10);

export interface Streak {
  current: number;
  best: number;
  shields: number;
}

const WEEKS_PER_SHIELD = 4;
const MAX_SHIELDS = 2;

/**
 * Weeks in a row, Monday to Sunday, that hit the goal, counting each day once. The
 * week in progress adds to a streak once it's met, and can't break one until it's
 * over. Every fourth week earns a shield, spent by itself on the next missed week.
 * With none left the streak goes back to zero. A paused week neither adds nor breaks.
 */
export function weekStreak(dates: string[], goals: Goals, today: string, pausedWeeks: string[] = []): Streak {
  const counts = new Map<number, number>();
  for (const date of new Set(dates)) counts.set(weekOf(date), (counts.get(weekOf(date)) ?? 0) + 1);
  const paused = new Set(pausedWeeks.map(weekOf));
  const thisWeek = weekOf(today);
  const first = Math.min(...counts.keys());

  let current = 0;
  let best = 0;
  let shields = 0;
  let earning = 0;
  for (let week = first; week <= thisWeek; week += 1) {
    if ((counts.get(week) ?? 0) >= goalIn(goals, mondayOfWeek(week))) {
      current += 1;
      earning += 1;
      best = Math.max(best, current);
      if (earning === WEEKS_PER_SHIELD) {
        earning = 0;
        shields = Math.min(MAX_SHIELDS, shields + 1);
      }
    } else if (week < thisWeek && !paused.has(week)) {
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

export const MAX_WEEK_BONUS = 15;
const STREAK_TIERS = [12, 8, 4, 2];
const STREAK_PAY: Record<number, number[]> = { 2: [4, 3, 2, 1], 3: [6, 4, 3, 1], 4: [8, 6, 4, 2] };
const COMEBACK_BONUS = 3;
const PERFECT_BONUS = 2;
const CREW_BONUS = 3;
const NEW_BEST_BONUS = 2;
const MAX_NEW_BEST = 6;
/** One earlier session is a coincidence. Two make a number worth beating. */
const NEW_BEST_HISTORY = 2;

/** Longer streaks and bigger goals both pay, and it's capped so history can't outweigh training. */
export function streakBonus(streak: number, goal: number): number {
  const tier = STREAK_TIERS.findIndex((weeks) => streak >= weeks);
  if (tier < 0) return 0;
  return STREAK_PAY[Math.min(Math.max(goal, 2), 4)]?.[tier] ?? 0;
}

export interface WeekBonuses {
  streak: number;
  comeback: number;
  newBest: number;
  crew: number;
  perfect: number;
  calls: number;
  total: number;
}

export function weekBonuses(workouts: ScoringWorkout[], goals: Goals, today: string, options: { pausedWeeks?: string[]; crewHitGoal?: boolean; calls?: number } = {}): WeekBonuses {
  const pausedWeeks = options.pausedWeeks ?? [];
  const dates = trainedDates(workouts);
  const thisWeek = mondayOf(today);
  const calls = Math.max(-MAX_CALL_POINTS, Math.min(MAX_CALL_POINTS, options.calls ?? 0));
  if (pausedWeeks.includes(thisWeek)) return { streak: 0, comeback: 0, newBest: 0, crew: 0, perfect: 0, calls, total: calls };

  const daysIn = (monday: string) => dates.filter((date) => mondayOf(date) === monday && date <= today).length;
  const days = daysIn(thisWeek);
  const lastWeek = addDays(thisWeek, -7);
  const goal = goalIn(goals, thisWeek);
  const streak = streakBonus(weekStreak(dates, goals, today, pausedWeeks).current, goal);
  // Only after a week really missed, and worth less than the score a missed week throws away.
  const comeback = days >= goal && daysIn(lastWeek) < goalIn(goals, lastWeek) && !pausedWeeks.includes(lastWeek) && dates.some((date) => date < lastWeek) ? COMEBACK_BONUS : 0;
  const perfect = days > goal ? PERFECT_BONUS : 0;
  const crew = options.crewHitGoal ? CREW_BONUS : 0;

  const bests = new Map<string, { max: number; sessions: number }>();
  let beaten = 0;
  for (const workout of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    if (workout.date > today || isBackdated(workout)) continue;
    for (const entry of workout.entries) {
      const max = entryMax(entry);
      if (max === null) continue;
      const key = `${exerciseKey(entry.name)}|${entrySetup(entry)}`;
      const best = bests.get(key) ?? { max: 0, sessions: 0 };
      if (workout.date >= thisWeek && best.sessions >= NEW_BEST_HISTORY && max > best.max) beaten += 1;
      bests.set(key, { max: Math.max(best.max, max), sessions: best.sessions + 1 });
    }
  }
  const newBest = Math.min(MAX_NEW_BEST, beaten * NEW_BEST_BONUS);
  return { streak, comeback, newBest, crew, perfect, calls, total: Math.min(MAX_WEEK_BONUS, streak + comeback + newBest + crew + perfect) + calls };
}

export const SEASON_WEEKS = 8;
export const START_RATING = 1000;
/** A week with no training at all costs this, so a low goal is no way round it. */
export const IDLE_DECAY = 15;
const RATING_K = 32;

/** Each person's opponent, by the circle method: everyone meets everyone, and byes take turns. */
export function weekPairs(members: string[], week: number): { pairs: [string, string][]; bye: string | null } {
  const order = [...members].sort();
  const circle: (string | null)[] = order.length % 2 ? [...order, null] : order;
  const size = circle.length;
  if (size < 2) return { pairs: [], bye: null };
  const turn = ((week % (size - 1)) + size - 1) % (size - 1);
  const rest = circle.slice(1);
  const rotated = [circle[0]!, ...rest.slice(rest.length - turn), ...rest.slice(0, rest.length - turn)];
  const pairs: [string, string][] = [];
  let bye: string | null = null;
  for (let i = 0; i < size / 2; i += 1) {
    const a = rotated[i] ?? null;
    const b = rotated[size - 1 - i] ?? null;
    if (a && b) pairs.push([a, b]);
    else bye = a ?? b;
  }
  return { pairs, bye };
}

/** Standard Elo: beating someone rated above you pays more than beating someone below. */
export function ratingChange(rating: number, opponent: number, score: number, opponentScore: number): number {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  const actual = score === opponentScore ? 0.5 : score > opponentScore ? 1 : 0;
  return Math.round(RATING_K * (actual - expected));
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

/** True when a later session of any lift beat everything before it, weighed the same way. */
export function beatABest(workouts: ScoringWorkout[]): boolean {
  const best = new Map<string, number>();
  for (const workout of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const entry of workout.entries) {
      const max = entryMax(entry);
      if (max === null) continue;
      const key = `${exerciseKey(entry.name)}|${entrySetup(entry)}`;
      const previous = best.get(key);
      if (previous !== undefined && max > previous) return true;
      best.set(key, Math.max(previous ?? 0, max));
    }
  }
  return false;
}
