import { z } from 'zod';
import { findLift } from './exercises';
import { importedWorkoutId } from './integrations';
import { MAX_VARIED_SETS, type Entry, type LoggedWorkout } from './schemas';
import { tidySets } from './strength';
import { dateIn } from './time';

/** What Lyfta's API sends for one workout, kept loose: anything it adds later is ignored, and numbers come as strings. */
const lyftaSetSchema = z.object({
  weight: z.union([z.string(), z.number()]).nullish(),
  reps: z.union([z.string(), z.number()]).nullish(),
  rir: z.union([z.string(), z.number()]).nullish(),
  is_completed: z.boolean().nullish(),
});
export const lyftaWorkoutSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  title: z.string().nullish(),
  workout_perform_date: z.string(),
  exercises: z.array(z.object({
    // Lyfta's spelling, as its API sends it.
    excercise_name: z.string(),
    sets: z.array(lyftaSetSchema).default([]),
  })).default([]),
});
export type LyftaWorkout = z.infer<typeof lyftaWorkoutSchema>;

export const LYFTA_UNITS = ['kg', 'lb'] as const;
export type LyftaUnit = (typeof LYFTA_UNITS)[number];
const KG_PER_LB = 0.45359237;

export const lyftaSettingsSchema = z.object({ unit: z.enum(LYFTA_UNITS) });

const numberOf = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * A Lyfta workout as a Sandbag session, or null when it has nothing to log. Only finished sets with reps count,
 * so timed and distance exercises are left out. Names the catalog knows take the catalog's name, and its side
 * rule, so they line up with lifts logged in Sandbag. Effort comes from the hardest set's reps in reserve.
 */
export function fromLyfta(workout: LyftaWorkout, unit: LyftaUnit, timeZone: string | null): Omit<LoggedWorkout, 'updatedAt'> | null {
  const toKg = (value: number) => (unit === 'lb' ? Math.round(value * KG_PER_LB * 100) / 100 : value);
  const entries: Entry[] = [];
  workout.exercises.forEach((exercise, index) => {
    const done = exercise.sets
      .filter((set) => set.is_completed !== false)
      .map((set) => ({ weight: numberOf(set.weight), reps: numberOf(set.reps), rir: numberOf(set.rir) }))
      .filter((set): set is { weight: number | null; reps: number; rir: number | null } => set.reps !== null && set.reps > 0)
      .slice(0, MAX_VARIED_SETS);
    if (!done.length) return;
    const lift = findLift(exercise.excercise_name);
    const weights = done.map((set) => (set.weight && set.weight > 0 ? toKg(set.weight) : null));
    const rirs = done.map((set) => set.rir).filter((rir): rir is number => rir !== null);
    entries.push(tidySets({
      id: `${importedWorkoutId('lyfta', workout.id)}-${index}`,
      name: (lift?.name ?? exercise.excercise_name.trim()).slice(0, 100) || 'Lift',
      kind: 'strength',
      sets: done.length,
      reps: Math.round(done[0]!.reps),
      setReps: done.map((set) => Math.round(set.reps)),
      weight: weights[0] ?? null,
      setWeights: weights,
      perSide: lift?.perSide ?? false,
      rpe: rirs.length ? Math.min(10, Math.max(0, 10 - Math.min(...rirs))) : null,
      minutes: null,
      note: '',
    }));
  });
  if (!entries.length) return null;
  return {
    id: importedWorkoutId('lyfta', workout.id),
    date: dateIn(timeZone, new Date(workout.workout_perform_date)),
    title: workout.title?.trim().slice(0, 100) || 'Workout',
    savedWorkoutId: null,
    entries: entries.slice(0, 100),
    deleted: false,
  };
}
