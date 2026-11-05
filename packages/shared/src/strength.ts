import type { Entry } from './schemas';

/** Past this many reps the estimate stops meaning much, and 50 light reps shouldn't look like a heavy single. */
const MAX_ESTIMATE_REPS = 12;
/** Above every record on purpose, so nobody real is ever doubted. Past it, a number is a joke or a typo. */
const BELIEVABLE_MAX = 1500;
/** 500 kg for 40 reps, in one set. */
const BELIEVABLE_SET_KG = 20_000;

type SetFields = Pick<Entry, 'sets' | 'weight' | 'reps'> & Partial<Pick<Entry, 'setReps' | 'setWeights' | 'setDrops'>>;
type StrengthEntry = Pick<Entry, 'kind'> & SetFields & Partial<Pick<Entry, 'perSide' | 'includesEquipment' | 'minutes'>>;

export interface LiftSet {
  weight: number | null;
  reps: number | null;
}

/** Estimated one-rep max, so more reps at the same weight counts as stronger. */
export function estimatedMax(weight: number, reps: number | null): number {
  const counted = Math.min(Math.max(reps ?? 1, 1), MAX_ESTIMATE_REPS);
  return weight * (1 + (counted - 1) / 30);
}

/** A per-set list only describes the session when it has one value for every set. */
const perSet = <T>(list: T[] | undefined, sets: number): list is T[] => list?.length === sets;

/** Whether each set has its own weight, rather than one weight for them all. */
export const hasSetWeights = (entry: SetFields) => perSet(entry.setWeights, entry.sets || 1);

/** Every set as it was done. Without per-set lists, each set is the entry's weight × reps. */
export function setsOf(entry: SetFields): LiftSet[] {
  const sets = entry.sets || 1;
  const reps = perSet(entry.setReps, sets) ? entry.setReps : undefined;
  const weights = perSet(entry.setWeights, sets) ? entry.setWeights : undefined;
  return Array.from({ length: sets }, (_, set) => ({ weight: weights ? weights[set]! : entry.weight, reps: reps ? reps[set]! : entry.reps }));
}

/** Whether a set could have happened. Zero reps can't: holding a bar isn't lifting it. */
function believable(entry: StrengthEntry, set: LiftSet): set is LiftSet & { weight: number } {
  if (set.reps === 0 || !set.weight) return false;
  const total = set.weight * (entry.perSide ? 2 : 1);
  return estimatedMax(total, set.reps) <= BELIEVABLE_MAX && total * (set.reps ?? 1) <= BELIEVABLE_SET_KG;
}

/** The set with the highest estimated max, or null when no set has a believable weight. */
export function bestSet(entry: StrengthEntry): (LiftSet & { weight: number; max: number }) | null {
  if (entry.kind !== 'strength') return null;
  let best: (LiftSet & { weight: number; max: number }) | null = null;
  for (const set of setsOf(entry)) {
    if (!believable(entry, set)) continue;
    const max = estimatedMax(set.weight, set.reps);
    if (!best || max > best.max) best = { ...set, max };
  }
  return best;
}

/** The best believable set of a strength entry, as an estimated max, or null when there's nothing to compare. */
export const entryMax = (entry: StrengthEntry): number | null => bestSet(entry)?.max ?? null;

/**
 * Per-set lists kept only when they say something: one value for every set, and not all the same.
 * `weight` becomes the heaviest set, so anything that reads one weight still reads a true one.
 * Drop-set marks stay when at least one set has one.
 */
export function tidySets<T extends SetFields>(entry: T): T {
  const { setReps, setWeights, setDrops, ...rest } = entry;
  const sets = entry.sets ?? 0;
  const varies = <V>(list: V[] | undefined): list is V[] => perSet(list, sets) && new Set(list).size > 1;
  const tidy = { ...rest } as T;
  if (varies(setReps)) tidy.setReps = setReps;
  else if (perSet(setReps, sets) && sets) tidy.reps = setReps[0] ?? null;
  if (varies(setWeights)) {
    tidy.setWeights = setWeights;
    const weighed = setWeights.filter((value): value is number => value !== null);
    tidy.weight = weighed.length ? Math.max(...weighed) : null;
  } else if (perSet(setWeights, sets) && sets) {
    tidy.weight = setWeights[0] ?? null;
  }
  if (perSet(setDrops, sets) && setDrops.some(Boolean)) tidy.setDrops = setDrops;
  return tidy;
}

/** Weights only compare when they were weighed the same way: per side or total, with or without the bar. */
export const entrySetup = (entry: Partial<Pick<Entry, 'perSide' | 'includesEquipment'>>) => `${entry.perSide ?? false}/${entry.includesEquipment ?? 'unsaid'}`;

/** A name alone proves nothing, and neither does a joke. It takes real work to count as training. */
export function hasWork(entry: StrengthEntry): boolean {
  if (entry.kind === 'time') return Boolean(entry.minutes);
  const sets = setsOf(entry);
  return sets.some((set) => set.weight) ? bestSet(entry) !== null : sets.some((set) => set.reps);
}
