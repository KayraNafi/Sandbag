import { entryMax, exerciseKey, setsOf, type Entry, type LoggedWorkout, type SavedExercise, type SavedWorkout } from '@sandbag/shared';

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
}

export interface Draft {
  id: string;
  date: string;
  title: string;
  savedWorkoutId: string | null;
  /** True when changing a workout that was already logged. */
  editing: boolean;
  entries: DraftEntry[];
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
    done: false,
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

/** Keeps what's typed for the sets that remain, and new sets start at the usual number. */
export function fitPerSet(current: (number | null)[], sets: number, usual: number | null): (number | null)[] {
  return Array.from({ length: sets }, (_, set) => (set < current.length ? current[set] ?? null : usual));
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
