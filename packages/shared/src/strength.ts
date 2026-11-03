import type { Entry } from './schemas';

/** Past this many reps the estimate stops meaning much, and 50 light reps shouldn't look like a heavy single. */
const MAX_ESTIMATE_REPS = 12;
/** Above every record on purpose, so nobody real is ever doubted. Past it, a number is a joke or a typo. */
const BELIEVABLE_MAX = 1500;
/** 500 kg for 40 reps, in one set. */
const BELIEVABLE_SET_KG = 20_000;

type StrengthEntry = Pick<Entry, 'kind' | 'weight' | 'reps'> & Partial<Pick<Entry, 'setReps' | 'perSide' | 'includesEquipment' | 'minutes'>>;

/** Estimated one-rep max, so more reps at the same weight counts as stronger. */
export function estimatedMax(weight: number, reps: number | null): number {
  const counted = Math.min(Math.max(reps ?? 1, 1), MAX_ESTIMATE_REPS);
  return weight * (1 + (counted - 1) / 30);
}

/** The most reps any set of an entry reached, or null when no reps were written down. */
export function topReps(entry: Pick<Entry, 'reps'> & Partial<Pick<Entry, 'setReps'>>): number | null {
  const written = [entry.reps, ...(entry.setReps ?? [])].filter((value): value is number => value !== null);
  return written.length ? Math.max(...written) : null;
}

/** Whether a set could have happened. Zero reps can't: holding a bar isn't lifting it. */
function believable(entry: StrengthEntry, reps: number | null): boolean {
  if (reps === 0 || entry.weight === null) return false;
  const total = entry.weight * (entry.perSide ? 2 : 1);
  return estimatedMax(total, reps) <= BELIEVABLE_MAX && total * (reps ?? 1) <= BELIEVABLE_SET_KG;
}

/** The best believable set of a strength entry, as an estimated max, or null when there's nothing to compare. */
export function entryMax(entry: StrengthEntry): number | null {
  if (entry.kind !== 'strength' || !entry.weight) return null;
  const reps = topReps(entry);
  return believable(entry, reps) ? estimatedMax(entry.weight, reps) : null;
}

/** Weights only compare when they were weighed the same way: per side or total, with or without the bar. */
export const entrySetup = (entry: Partial<Pick<Entry, 'perSide' | 'includesEquipment'>>) => `${entry.perSide ?? false}/${entry.includesEquipment ?? 'unsaid'}`;

/** A name alone proves nothing, and neither does a joke. It takes real work to count as training. */
export function hasWork(entry: StrengthEntry): boolean {
  if (entry.kind === 'time') return Boolean(entry.minutes);
  return entry.weight ? entryMax(entry) !== null : Boolean(topReps(entry));
}
