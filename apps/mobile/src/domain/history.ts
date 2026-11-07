import { entryMax, entrySetup, estimatedMax, exerciseKey, setsOf, type Entry, type Linkable, type LoggedWorkout, type SavedExercise, type SavedWorkout } from '@sandbag/shared';
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

export interface DraftEntry extends Entry {
  done: boolean;
  /** One per set, for sets ticked one at a time. Absent when the lift is ticked as a whole. See domain/sets. */
  ticks?: boolean[];
}

export interface Draft {
  id: string;
  date: string;
  title: string;
  savedWorkoutId: string | null;
  /** True when changing a workout that was already logged. */
  editing: boolean;
  entries: DraftEntry[];
  /** When it began, for the clock on the step-by-step screen. Not logged. */
  startedAt?: number;
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
    for (const entry of workout.entries) {
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

/** The best set before a date, weighed the same way, by the measure the rankings use. So beating it here is a new best there. */
export function bestSetBefore(index: Map<string, ExerciseHistory>, entry: Pick<Entry, 'name' | 'perSide' | 'includesEquipment'>, date: string): number | null {
  const setup = entrySetup(entry);
  const values = (index.get(exerciseKey(entry.name))?.log ?? [])
    .filter((item) => item.date < date && entrySetup(item) === setup)
    .map(entryMax)
    .filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

/** Further than this and it isn't a nudge, it's a different day's training. */
const BEST_WITHIN_JUMPS = 3;

/** The nearest weight, at these reps, that would be a new best. Null when it's out of reach today. */
export function weightToBeat(weight: number, reps: number | null, jump: number, best: number): number | null {
  let next = weight;
  for (let step = 0; step < BEST_WITHIN_JUMPS; step += 1) {
    next = nudge(next, jump);
    if (estimatedMax(next, reps) > best) return next;
  }
  return null;
}

/** The last session of the same workout: the same saved one, or the same name when it wasn't saved. */
export function lastSessionOf(workouts: LoggedWorkout[], draft: Pick<Draft, 'id' | 'date' | 'title' | 'savedWorkoutId'>): LoggedWorkout | null {
  return workouts.find((workout) => workout.id !== draft.id && workout.date <= draft.date
    && (draft.savedWorkoutId ? workout.savedWorkoutId === draft.savedWorkoutId : workout.title === draft.title)) ?? null;
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

export function draftEntryFor(
  index: Map<string, ExerciseHistory>,
  exercise: SavedExercise,
  newId: () => string,
): DraftEntry {
  const last = lastLogged(index, exercise.name);
  return {
    id: newId(),
    name: exercise.name,
    kind: last?.kind ?? exercise.kind,
    sets: last?.sets ?? exercise.sets,
    reps: last?.reps ?? exercise.reps,
    weight: last?.weight ?? null,
    perSide: last?.perSide ?? false,
    includesEquipment: last?.includesEquipment,
    rpe: last?.rpe ?? null,
    minutes: last?.minutes ?? null,
    note: last?.note ?? '',
    ...(exercise.supersetWithNext ? { supersetWithNext: true } : {}),
    done: false,
  };
}

/** Order and pairs count, so a session done in a new order or with new supersets can offer to update the saved workout. */
export function sameExercises(a: (Linkable & { name: string })[], b: (Linkable & { name: string })[]): boolean {
  const key = (list: (Linkable & { name: string })[]) => list.map((item) => `${exerciseKey(item.name)}${item.supersetWithNext ? '+' : ''}`).join('|');
  return key(a) === key(b);
}

/** Moves one item to another place in the list, the way a drag does. */
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  const item = list[from];
  if (item === undefined || to < 0 || to >= list.length || from === to) return list;
  const next = list.filter((_, position) => position !== from);
  next.splice(to, 0, item);
  return next;
}

export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  const item = list[index];
  if (item === undefined || target < 0 || target >= list.length) return list;
  const next = list.filter((_, position) => position !== index);
  next.splice(target, 0, item);
  return next;
}

/** Every kilo lifted in a session: weight × reps for each set, both sides when it's per side. Joke numbers count for nothing. */
export function volumeOf(workout: Pick<LoggedWorkout, 'entries'>): number {
  return Math.round(workout.entries.reduce((total, entry) => {
    if (entryMax(entry) === null) return total;
    return total + setsOf(entry).reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0) * (entry.perSide ? 2 : 1), 0);
  }, 0));
}
