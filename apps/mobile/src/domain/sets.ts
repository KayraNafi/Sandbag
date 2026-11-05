import { entryMax, MAX_VARIED_SETS, tidySets, type Entry } from '@sandbag/shared';
import type { DraftEntry } from './history';

/**
 * How a draft's sets change, for both logging layouts. They edit the same fields, so a
 * workout can switch layouts halfway and nothing is lost or read differently.
 */

type PerSet = Pick<Entry, 'setReps' | 'setWeights'>;

/** Keeps what's typed for the sets that remain, and new sets start at the usual number. */
export function fitPerSet<T>(current: T[], sets: number, usual: T): T[] {
  return Array.from({ length: sets }, (_, set) => (set < current.length ? current[set]! : usual));
}

/** Between 2 and 20 sets can each have their own numbers. */
export const canVary = (sets: number) => sets >= 2 && sets <= MAX_VARIED_SETS;

/** Whether the sets have their own numbers, rather than one weight × reps for all. */
export const varies = (entry: DraftEntry) => canVary(entry.sets ?? 0) && (entry.setReps !== undefined || entry.setWeights !== undefined);

/** Both lists, one value per set, filled from the usual numbers where nothing's typed yet. */
export function perSetLists(entry: DraftEntry, sets = entry.sets ?? 0): Required<PerSet> {
  return { setReps: fitPerSet(entry.setReps ?? [], sets, entry.reps), setWeights: fitPerSet(entry.setWeights ?? [], sets, entry.weight) };
}

/** The weight and reps of one set, whether or not the sets differ. */
export function setAt(entry: DraftEntry, set: number): { weight: number | null; reps: number | null } {
  if (!varies(entry)) return { weight: entry.weight, reps: entry.reps };
  const lists = perSetLists(entry);
  return { weight: lists.setWeights[set] ?? null, reps: lists.setReps[set] ?? null };
}

/** One set's estimated max, by the rankings' measure, or null when nobody could lift it. */
export const setMax = (entry: Pick<Entry, 'kind' | 'perSide'>, weight: number, reps: number | null): number | null =>
  entryMax({ kind: entry.kind, perSide: entry.perSide, sets: 1, weight, reps });

/** Which sets are ticked. The list layout ticks a whole lift, which is every set. */
export function ticksOf(entry: DraftEntry): boolean[] {
  const sets = Math.max(entry.sets ?? 1, 1);
  return entry.ticks ? fitPerSet(entry.ticks, sets, false) : Array.from({ length: sets }, () => entry.done);
}

export const tickedCount = (entry: DraftEntry) => ticksOf(entry).filter(Boolean).length;

/** A lift is done once any of its sets is. */
export function withTick(entry: DraftEntry, set: number, on: boolean): Partial<DraftEntry> {
  const ticks = ticksOf(entry).map((tick, position) => (position === set ? on : tick));
  return { sets: ticks.length, ticks, done: ticks.some(Boolean) };
}

/** Ticked as a whole lift, the way the list layout does it. */
export const withDone = (done: boolean): Partial<DraftEntry> => ({ done, ticks: undefined });

/** Drop sets can be marked on up to 20 sets, like the other per-set numbers. */
export const canMarkDrops = (sets: number) => sets >= 1 && sets <= MAX_VARIED_SETS;

/** Which sets were drop sets: to failure, then on at lighter weights without a rest. */
export function dropsOf(entry: DraftEntry): boolean[] {
  return fitPerSet(entry.setDrops ?? [], Math.max(entry.sets ?? 1, 1), false);
}

export const hasDrops = (entry: DraftEntry) => dropsOf(entry).some(Boolean);

export function withDrop(entry: DraftEntry, set: number, on: boolean): Partial<DraftEntry> {
  const drops = dropsOf(entry).map((drop, position) => (position === set ? on : drop));
  return { setDrops: drops.some(Boolean) ? drops : undefined };
}

/** The list layout marks the lift, which means its last set: where a drop set nearly always goes. */
export const withLastDrop = (entry: DraftEntry, on: boolean): Partial<DraftEntry> =>
  (on ? withDrop(entry, dropsOf(entry).length - 1, true) : { setDrops: undefined });

/** Marks follow the sets. A mark on the last set stays on the last set, wherever that ends up. */
function fitDrops(entry: DraftEntry, sets: number): Partial<DraftEntry> {
  if (!entry.setDrops) return {};
  if (!canMarkDrops(sets)) return { setDrops: undefined };
  const drops = dropsOf(entry);
  const onlyLast = drops.findIndex(Boolean) === drops.length - 1;
  const fitted = onlyLast ? Array.from({ length: sets }, (_, set) => set === sets - 1) : fitPerSet(drops, sets, false);
  return { setDrops: fitted.some(Boolean) ? fitted : undefined };
}

/** A new number of sets. Typing "12" passes through "1", so lists only change at a count that can vary. */
export function withSetCount(entry: DraftEntry, sets: number | null): Partial<DraftEntry> {
  const lists = varies(entry) && sets !== null && canVary(sets) ? perSetLists(entry, sets) : {};
  const drops = sets !== null && sets >= 1 ? fitDrops(entry, sets) : {};
  if (!entry.ticks || sets === null || sets < 1) return { sets, ...lists, ...drops };
  const ticks = fitPerSet(entry.ticks, sets, false);
  return { sets, ...lists, ...drops, ticks, done: ticks.some(Boolean) };
}

/** Turns per-set numbers on or off. Off goes back to one weight × reps. */
export const withVarying = (entry: DraftEntry, on: boolean): Partial<DraftEntry> =>
  (on ? perSetLists(entry) : { setReps: undefined, setWeights: undefined });

/**
 * One set's weight or reps. The heaviest set stays the weight, which next time starts from.
 * `onward` carries it to the sets after it that aren't ticked yet, which is nearly always what's meant.
 * `fold` drops the lists again once every set is the same, for a layout that doesn't show them.
 */
export function withSetValue(entry: DraftEntry, set: number, field: 'weight' | 'reps', value: number | null, { onward = false, fold = false } = {}): Partial<DraftEntry> {
  const sets = entry.sets ?? 0;
  if (!canVary(sets)) return { [field]: value };
  const lists = perSetLists(entry);
  const ticks = ticksOf(entry);
  const key = field === 'weight' ? 'setWeights' : 'setReps';
  const list = lists[key].map((item, position) => (position === set || (onward && position > set && !ticks[position]) ? value : item));
  const next = { ...lists, [key]: list };
  const same = (values: (number | null)[]) => values.every((item) => item === values[0]);
  if (fold && same(next.setWeights) && same(next.setReps)) {
    return { setReps: undefined, setWeights: undefined, weight: next.setWeights[0] ?? null, reps: next.setReps[0] ?? null };
  }
  const weighed = next.setWeights.filter((item): item is number => item !== null);
  return { ...next, weight: weighed.length ? Math.max(...weighed) : null, reps: field === 'reps' ? entry.reps ?? value : entry.reps };
}

/** What gets logged: only the sets that were ticked, with lists kept only where they say something. */
export function toEntry(draft: DraftEntry): Entry {
  const { done: _done, ticks: _ticks, ...entry } = draft;
  const ticks = ticksOf(draft);
  if (entry.kind === 'time' || !draft.ticks || ticks.every(Boolean)) return tidySets(entry);
  const lists = perSetLists(draft, ticks.length);
  const kept = <T>(list: T[]) => list.filter((_, set) => ticks[set]);
  return tidySets({ ...entry, sets: kept(ticks).length, setReps: kept(lists.setReps), setWeights: kept(lists.setWeights), setDrops: kept(dropsOf(draft)) });
}

/** Each drop takes off about a fifth, rounded down to what the plates allow. A hint, so it isn't logged. */
const DROP_SHARE = 0.8;

export function dropWeight(weight: number, jump: number, drops: number): number {
  const load = Math.floor((weight * DROP_SHARE ** drops) / jump) * jump;
  return Math.max(Math.round(load * 100) / 100, jump);
}

/** The usual ramp to a working weight: half for 5, 70% for 3, 85% for 1, each rounded down to what the gym's plates allow. */
const WARMUP_LADDER = [[0.5, 5], [0.7, 3], [0.85, 1]] as const;

export function warmupSets(weight: number, jump: number): { weight: number; reps: number }[] {
  const ladder: { weight: number; reps: number }[] = [];
  for (const [share, reps] of WARMUP_LADDER) {
    const load = Math.round(Math.floor((weight * share) / jump) * jump * 100) / 100;
    if (load > (ladder.at(-1)?.weight ?? 0) && load < weight) ladder.push({ weight: load, reps });
  }
  return ladder;
}
