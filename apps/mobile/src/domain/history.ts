import { addDays, believableSet, catalogEntry, entryMax, entrySetup, EQUIPMENT_STEP, estimatedMax, exerciseKey, MAX_VARIED_SETS, type Entry, type LoggedWorkout, type Muscle, type SavedExercise, type SavedWorkout, goalsOf, type GoalChange, type Goals } from '@sandbag/shared';

import { nudge } from './format';

export interface LogItem extends Entry {
  date: string;
  workoutId: string;
}

export interface ExerciseHistory {
  key: string;
  name: string;
  log: LogItem[];
}

const WARMUP_LADDER = [[0.5, 5], [0.7, 3], [0.85, 1]] as const;

/** One set as it's being logged. */
export interface DraftRow {
  weight: number | null;
  reps: number | null;
  done: boolean;
}

export interface DraftEntry extends Entry {
  /** True once any set is ticked. */
  done: boolean;
  /** Absent on a draft saved by an older version of the app. See rowsOf. */
  rows?: DraftRow[];
}

export interface Draft {
  id: string;
  date: string;
  title: string;
  savedWorkoutId: string | null;
  /** True when changing a workout that was already logged. */
  editing: boolean;
  entries: DraftEntry[];
  /** For the session clock. */
  startedAt?: number;
  /** What an edit has to keep, since nothing is timing it. */
  durationSeconds?: number | null;
}

export function activeLogged(logged: Record<string, LoggedWorkout>): LoggedWorkout[] {
  return Object.values(logged)
    .filter((workout) => !workout.deleted)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

export function activeSaved(saved: Record<string, SavedWorkout>): SavedWorkout[] {
  return Object.values(saved)
    .filter((workout) => !workout.deleted)
    .sort((a, b) => a.position - b.position);
}

/** Oldest entry first in each exercise's log. */
export function buildHistory(workouts: LoggedWorkout[]): Map<string, ExerciseHistory> {
  const index = new Map<string, ExerciseHistory>();
  for (const workout of [...workouts].reverse()) {
    for (const logged of workout.entries) {
      const entry = trustedEntry(logged);
      if (!entry) continue;
      const key = exerciseKey(entry.name);
      const history = index.get(key) ?? { key, name: entry.name, log: [] };
      history.name = entry.name;
      history.log.push({ ...entry, date: workout.date, workoutId: workout.id });
      index.set(key, history);
    }
  }
  return index;
}

export function lastLogged(index: Map<string, ExerciseHistory>, name: string, beforeDate?: string): LogItem | null {
  const log = index.get(exerciseKey(name))?.log ?? [];
  const usable = beforeDate ? log.filter((item) => item.date < beforeDate) : log;
  return usable.at(-1) ?? null;
}

export const metricOf = (entry: Pick<Entry, 'kind' | 'weight' | 'minutes'>): number | null =>
  entry.kind === 'time' ? entry.minutes : entry.weight;

export function bestBefore(index: Map<string, ExerciseHistory>, name: string, date: string): number | null {
  const values = (index.get(exerciseKey(name))?.log ?? [])
    .filter((item) => item.date < date)
    .map(metricOf)
    .filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

/** The number a set has to beat to be a new best, in the same setup and measured the way scoring does. */
export function bestSetBefore(index: Map<string, ExerciseHistory>, entry: Pick<Entry, 'name' | 'kind' | 'perSide' | 'includesEquipment'>, date: string): number | null {
  const setup = entrySetup(entry);
  const values = (index.get(exerciseKey(entry.name))?.log ?? [])
    .filter((item) => item.date < date && entrySetup(item) === setup)
    .map(entryMax)
    .filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

/** Past weights for this lift, for one-tap entry of odd machine-stack numbers. */
export function recentWeights(index: Map<string, ExerciseHistory>, name: string, limit = 6): number[] {
  const log = index.get(exerciseKey(name))?.log ?? [];
  const seen: number[] = [];
  for (let i = log.length - 1; i >= 0 && seen.length < limit; i -= 1) {
    const weight = log[i]?.weight;
    if (weight !== null && weight !== undefined && !seen.includes(weight)) seen.push(weight);
  }
  return seen.sort((a, b) => a - b);
}

/** Saved workouts run in order and loop, so Upper is followed by Lower. */
export function nextWorkout(saved: SavedWorkout[], logged: LoggedWorkout[]): SavedWorkout | null {
  if (!saved.length) return null;
  const last = logged.find((workout) => saved.some((item) => item.id === workout.savedWorkoutId));
  if (!last) return saved[0] ?? null;
  const index = saved.findIndex((item) => item.id === last.savedWorkoutId);
  return saved[(index + 1) % saved.length] ?? null;
}

const DEFAULT_SETS = 3;
const DEFAULT_REPS = 8;

/** One row per set, from whatever a past session or plan says. */
export function rowsFrom(entry: Pick<Entry, 'sets' | 'reps' | 'weight' | 'setReps' | 'setWeights'>, done = false): DraftRow[] {
  const count = Math.max(1, Math.min(entry.sets ?? DEFAULT_SETS, MAX_VARIED_SETS));
  return Array.from({ length: count }, (_, set) => ({
    weight: entry.setWeights?.[set] ?? entry.weight,
    reps: entry.setReps?.[set] ?? entry.reps,
    done,
  }));
}

export const rowsOf = (entry: DraftEntry): DraftRow[] => entry.rows ?? rowsFrom(entry, entry.done);

export function draftEntryFor(
  index: Map<string, ExerciseHistory>,
  exercise: SavedExercise,
  newId: () => string,
): DraftEntry {
  const last = lastLogged(index, exercise.name);
  const known = catalogEntry(exercise.name);
  const sets = last?.sets ?? exercise.sets ?? (exercise.kind === 'strength' ? DEFAULT_SETS : null);
  const reps = last?.reps ?? exercise.reps ?? (exercise.kind === 'strength' ? DEFAULT_REPS : null);
  const entry: Entry = {
    id: newId(),
    name: known && !last ? known.name : exercise.name,
    kind: last?.kind ?? exercise.kind,
    sets,
    reps,
    weight: last?.weight ?? null,
    perSide: last?.perSide ?? known?.perSide ?? false,
    includesEquipment: last?.includesEquipment,
    rpe: null,
    minutes: last?.minutes ?? null,
    note: '',
  };
  return {
    ...entry,
    done: false,
    rows: rowsFrom({ ...entry, ...(last?.setReps ? { setReps: last.setReps } : {}), ...(last?.setWeights ? { setWeights: last.setWeights } : {}) }),
  };
}

/** What gets saved: only the sets ticked, and per-set lists only when the sets differ. */
export function toEntry({ done: _done, rows, ...entry }: DraftEntry): Entry {
  if (entry.kind === 'time' || !rows) return entry;
  const ticked = rows.filter((row) => row.done);
  const weights = ticked.map((row) => row.weight);
  const reps = ticked.map((row) => row.reps);
  const numbers = weights.filter((weight): weight is number => weight !== null);
  const same = <T,>(list: T[]) => list.every((item) => item === list[0]);
  const { setReps: _reps, setWeights: _weights, ...plain } = entry;
  return {
    ...plain,
    sets: ticked.length,
    weight: numbers.length ? Math.max(...numbers) : null,
    reps: reps[0] ?? null,
    ...(same(reps) ? {} : { setReps: reps }),
    ...(same(weights) ? {} : { setWeights: weights }),
  };
}

export function toSavedExercises(entries: Entry[]): SavedExercise[] {
  return entries.map(({ name, kind, sets, reps }) => ({ name, kind, sets, reps }));
}

/** Order counts, so a session done in a new order can offer to update the saved workout. */
export function sameExercises(a: { name: string }[], b: { name: string }[]): boolean {
  const key = (list: { name: string }[]) => list.map((item) => exerciseKey(item.name)).join('|');
  return key(a) === key(b);
}

export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  const item = list[index];
  if (item === undefined || target < 0 || target >= list.length) return list;
  const next = list.filter((_, position) => position !== index);
  next.splice(target, 0, item);
  return next;
}

/** Sets each muscle got, with the main muscle counting in full and the helpers at half. */
export function muscleSets(entries: { name: string; sets?: number | null }[]): Partial<Record<Muscle, number>> {
  const sets: Partial<Record<Muscle, number>> = {};
  for (const entry of entries) {
    catalogEntry(entry.name)?.muscles.forEach((muscle, position) => {
      sets[muscle] = (sets[muscle] ?? 0) + (entry.sets ?? 1) * (position === 0 ? 1 : 0.5);
    });
  }
  return sets;
}

/** About ten hard sets a week is plenty for a muscle, so that's where the map tops out. */
const FULL_SETS = 10;

/** What each muscle has had this period, from 0 to 1. */
export function muscleLoad(workouts: Pick<LoggedWorkout, 'entries'>[]): Partial<Record<Muscle, number>> {
  const sets = muscleSets(workouts.flatMap((workout) => workout.entries));
  return Object.fromEntries(Object.entries(sets).map(([muscle, count]) => [muscle, Math.min(1, count / FULL_SETS)]));
}

/** A plan against itself: whatever it hits hardest is full, and the rest are measured from there. */
export function previewLoad(entries: { name: string; sets?: number | null }[]): Partial<Record<Muscle, number>> {
  const sets = muscleSets(entries);
  const most = Math.max(0, ...Object.values(sets));
  // A plan with no sets in it yet hits nothing, rather than dividing by nothing.
  return Object.fromEntries(Object.entries(sets).map(([muscle, count]) => [muscle, most ? count / most : 0]));
}

export const sessionLoad = (workout: Pick<LoggedWorkout, 'entries'>) => previewLoad(trustedEntries(workout.entries));

/** Further than this and it isn't a nudge, it's a different day's training. */
const BEST_WITHIN_JUMPS = 3;

/** The nearest weight, at these reps, that would be a new best. Null if it's out of reach today. */
export function weightToBeat(weight: number, reps: number | null, jump: number, best: number): number | null {
  let next = weight;
  for (let step = 0; step < BEST_WITHIN_JUMPS; step += 1) {
    next = nudge(next, jump);
    if (estimatedMax(next, reps) > best) return next;
  }
  return null;
}

/** The way up to a heavy first set. Not logged, because nobody's counting these. */
export function warmupSets(weight: number, jump: number, bar = 0): { weight: number; reps: number }[] {
  if (bar && weight <= bar) return [];
  const ladder: { weight: number; reps: number }[] = bar ? [{ weight: bar, reps: 10 }] : [];
  for (const [share, reps] of WARMUP_LADDER) {
    const load = Math.round(Math.floor((weight * share) / jump) * jump * 100) / 100;
    if (load > (ladder.at(-1)?.weight ?? 0) && load < weight) ladder.push({ weight: load, reps });
  }
  return ladder;
}

export type WeightJumps = Record<string, number>;

const kitOf = (name: string) => catalogEntry(name)?.equipment ?? 'barbell';

/** This lift's own jump, or the last one chosen for that kit here, or the usual one. */
export function jumpFor(jumps: WeightJumps, name: string): number {
  const kit = kitOf(name);
  return jumps[exerciseKey(name)] ?? jumps[`kit:${kit}`] ?? EQUIPMENT_STEP[kit];
}

export const withJump = (jumps: WeightJumps, name: string, jump: number): WeightJumps => ({ ...jumps, [exerciseKey(name)]: jump, [`kit:${kitOf(name)}`]: jump });

/** The sets as they happened. No sets logged means one: this is a claim about the day, so it doesn't guess at a plan. */
export const setsOf = (entry: Entry) => rowsFrom({ ...entry, sets: entry.sets ?? entry.setWeights?.length ?? 1 });

/**
 * The entry as far as we believe it: joke and typo sets taken out, or null if that's all there was.
 * The logged session keeps what was typed, so it can still be seen and fixed.
 */
export function trustedEntry<T extends Entry>(entry: T): T | null {
  if (entry.kind !== 'strength' || !entry.weight) return entry;
  const rows = setsOf(entry);
  const kept = rows.filter((row) => !row.weight || believableSet(entry, row.weight, row.reps));
  if (kept.length === rows.length) return entry;
  const weights = kept.map((row) => row.weight ?? 0);
  if (!weights.some(Boolean)) return null;
  return { ...entry, sets: kept.length, weight: Math.max(...weights), reps: kept[0]!.reps, setWeights: kept.map((row) => row.weight), setReps: kept.map((row) => row.reps) };
}

/** Whatever a session claimed that doesn't count, heaviest first, to say so out loud. */
export function leftOutOf(workout: Pick<LoggedWorkout, 'entries'>): { name: string; weight: number }[] {
  return workout.entries
    .filter((entry) => trustedEntry(entry) !== entry)
    .map((entry) => ({ name: entry.name, weight: entry.weight ?? 0 }))
    .sort((a, b) => b.weight - a.weight);
}

export const trustedEntries = <T extends Entry>(entries: T[]): T[] => entries.map(trustedEntry).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

/** Every session of the same workout up to this one, oldest first, by saved plan or else by name. */
export function sameWorkoutSessions(workouts: LoggedWorkout[], workout: LoggedWorkout): LoggedWorkout[] {
  const earlier = workouts
    .filter((item) => item.id !== workout.id && !item.deleted && item.date <= workout.date)
    .filter((item) => (workout.savedWorkoutId ? item.savedWorkoutId === workout.savedWorkoutId : item.title === workout.title));
  return [...[...earlier].sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt), workout];
}

/** The session before this one of the same workout. */
export const lastSameWorkout = (workouts: LoggedWorkout[], workout: LoggedWorkout): LoggedWorkout | null => sameWorkoutSessions(workouts, workout).at(-2) ?? null;

/** Where a session's total sits among every session of that workout. 1 is the biggest; ties go to the earlier one. */
export function sessionRank(sessions: LoggedWorkout[], workout: LoggedWorkout): number {
  const moved = volumeOf(workout);
  return 1 + sessions.filter((item) => item.id !== workout.id && volumeOf(item) >= moved).length;
}

export type Place = 1 | 2 | 3;

export interface LiftMedal {
  entry: Entry;
  place: Place;
  /** The number it beat, for a new best. */
  was: Entry | null;
}

/** Second place out of two isn't an achievement. It takes a few efforts before the lower steps of the podium mean anything. */
const PODIUM_NEEDS = 4;

const effortOf = (entry: Entry) => (entry.kind === 'time' ? entry.minutes : entryMax(entry));

/**
 * Each lift's place among that person's own efforts, weighed the same way, so a new
 * best here is a new best in the rankings. A tie goes to the earlier effort.
 */
export function medalsFor(workouts: LoggedWorkout[], workout: LoggedWorkout): LiftMedal[] {
  const others = workouts.filter((item) => item.id !== workout.id && !item.deleted && item.date < workout.date).flatMap((item) => item.entries);
  const seen = new Map<string, LiftMedal>();
  for (const entry of trustedEntries(workout.entries)) {
    const value = effortOf(entry);
    if (value === null) continue;
    const key = `${exerciseKey(entry.name)}|${entrySetup(entry)}`;
    const earlier = trustedEntries(others).filter((item) => `${exerciseKey(item.name)}|${entrySetup(item)}` === key && effortOf(item) !== null);
    if (!earlier.length) continue;
    const ahead = earlier.filter((item) => effortOf(item)! >= value).length;
    if (ahead > 0 && earlier.length < PODIUM_NEEDS) continue;
    if (ahead > 2) continue;
    const best = earlier.reduce((top, item) => (effortOf(item)! > effortOf(top)! ? item : top));
    const medal: LiftMedal = { entry, place: (ahead + 1) as Place, was: ahead === 0 ? best : null };
    const same = seen.get(key);
    if (!same || medal.place < same.place) seen.set(key, medal);
  }
  return [...seen.values()].sort((a, b) => a.place - b.place);
}

/** Every kilo lifted in a session, both sides counted when the weight is per side. */
export function volumeOf(workout: Pick<LoggedWorkout, 'entries'>): number {
  return Math.round(trustedEntries(workout.entries).reduce((total, entry) => {
    if (entry.kind !== 'strength') return total;
    return total + setsOf(entry).reduce((sum, row) => sum + (row.weight ?? 0) * (row.reps ?? 0) * (entry.perSide ? 2 : 1), 0);
  }, 0));
}

export function neglected(load: Partial<Record<Muscle, number>>, muscles: readonly Muscle[]) {
  return muscles.filter((muscle) => !load[muscle]);
}

export interface WeekRecap {
  monday: string;
  sessions: LoggedWorkout[];
  moved: number;
  /** The week before, for something to compare to. */
  movedBefore: number;
  sets: number;
  days: number;
  bests: LiftMedal[];
}

/** One finished week, from the sessions already on the phone. The list comes newest first. */
export function weekRecap(workouts: LoggedWorkout[], monday: string): WeekRecap {
  const inWeek = (date: string, start: string) => date >= start && date <= addDays(start, 6);
  const sessions = workouts.filter((item) => inWeek(item.date, monday));
  const moved = (list: LoggedWorkout[]) => list.reduce((sum, item) => sum + volumeOf(item), 0);
  const bests = new Map<string, LiftMedal>();
  // Oldest first, so a lift beaten twice in the week ends on the later number.
  for (const session of [...sessions].reverse()) {
    for (const medal of medalsFor(workouts, session)) {
      if (medal.place === 1 && medal.was) bests.set(exerciseKey(medal.entry.name), medal);
    }
  }
  return {
    monday,
    sessions,
    moved: moved(sessions),
    movedBefore: moved(workouts.filter((item) => inWeek(item.date, addDays(monday, -7)))),
    sets: sessions.reduce((sum, item) => sum + trustedEntries(item.entries).reduce((count, entry) => count + (entry.sets ?? (entry.kind === 'time' ? 1 : 0)), 0), 0),
    days: new Set(sessions.map((item) => item.date)).size,
    bests: [...bests.values()],
  };
}

/** The goals someone has had. A goal changed today only starts next Monday. */
export const goalsFor = (me: { weeklyTarget: number; goalHistory?: readonly GoalChange[] } | null | undefined): Goals => (me ? goalsOf(me) : 3);
