import { describe, expect, it } from 'vitest';
import type { DraftEntry } from './history';
import { afterSet, dropsOf, dropWeight, fitPerSet, setAt, setMax, tickedCount, ticksOf, toEntry, varies, warmupSets, withDone, withDrop, withLastDrop, withSetCount, withSetValue, withTick } from './sets';

const bench = (extra: Partial<DraftEntry> = {}): DraftEntry => ({
  id: 'b', name: 'Bench', kind: 'strength', sets: 3, reps: 8, weight: 60, perSide: false, rpe: null, minutes: null, note: '', done: false, ...extra,
});

describe('fitPerSet', () => {
  it('fills from the usual number, and keeps typed values when the sets change', () => {
    expect(fitPerSet([], 3, 8)).toEqual([8, 8, 8]);
    expect(fitPerSet([8, 6], 4, 8)).toEqual([8, 6, 8, 8]);
    expect(fitPerSet([8, 6, 5], 2, 8)).toEqual([8, 6]);
    expect(fitPerSet([null, 6], 2, 8)).toEqual([null, 6]);
  });
});

describe('withSetValue', () => {
  it('gives one set its own weight and keeps the heaviest as the weight', () => {
    const next = withSetValue(bench(), 2, 'weight', 70);
    expect(next).toMatchObject({ setWeights: [60, 60, 70], setReps: [8, 8, 8], weight: 70 });
    expect(setAt({ ...bench(), ...next }, 2)).toEqual({ weight: 70, reps: 8 });
  });

  it('folds back to one number when every set matches again, if asked', () => {
    const ramped = { ...bench(), ...withSetValue(bench(), 2, 'weight', 70) };
    expect(withSetValue(ramped, 2, 'weight', 60, { fold: true })).toEqual({ setReps: undefined, setWeights: undefined, weight: 60, reps: 8 });
    expect(withSetValue(ramped, 2, 'weight', 60)).toMatchObject({ setWeights: [60, 60, 60] });
  });

  it('carries a change to the sets after it, if asked', () => {
    expect(withSetValue(bench(), 1, 'weight', 65, { onward: true })).toMatchObject({ setWeights: [60, 65, 65], weight: 65 });
  });

  it('changes the one number when there is a single set', () => {
    expect(withSetValue(bench({ sets: 1 }), 0, 'reps', 5)).toEqual({ reps: 5 });
  });
});

describe('withSetCount', () => {
  it('stretches per-set numbers and ticks to the new count', () => {
    const ramped = bench({ setWeights: [60, 65, 70], setReps: [8, 8, 8], ticks: [true, true, false], done: true });
    expect(withSetCount(ramped, 4)).toMatchObject({ sets: 4, setWeights: [60, 65, 70, 60], ticks: [true, true, false, false] });
    expect(withSetCount(ramped, 1)).toEqual({ sets: 1, ticks: [true], done: true });
    expect(withSetCount(bench(), 1)).toEqual({ sets: 1 });
  });
});

describe('ticking', () => {
  it('counts a lift ticked as a whole as every set, and single sets as they go', () => {
    expect(tickedCount(bench())).toBe(0);
    expect(tickedCount(bench(withDone(true)))).toBe(3);
    const one = bench(withTick(bench(), 1, true));
    expect(ticksOf(one)).toEqual([false, true, false]);
    expect(one.done).toBe(true);
    expect(bench(withTick(one, 1, false)).done).toBe(false);
  });

  it('carries a change only to sets not ticked yet', () => {
    const first = bench(withTick(bench(), 0, true));
    expect(withSetValue(first, 1, 'weight', 70, { onward: true })).toMatchObject({ setWeights: [60, 70, 70] });
    const third = bench(withTick(bench(), 2, true));
    expect(withSetValue(third, 0, 'weight', 70, { onward: true })).toMatchObject({ setWeights: [70, 70, 60] });
  });
});

describe('toEntry', () => {
  it('logs only the sets that were ticked, wherever they are', () => {
    const ramp = bench({ setWeights: [60, 65, 70], setReps: [8, 6, 4], ticks: [true, false, true], done: true });
    const entry = toEntry(ramp);
    expect(entry).toMatchObject({ sets: 2, weight: 70, setWeights: [60, 70], setReps: [8, 4] });
    expect('done' in entry || 'ticks' in entry).toBe(false);
  });

  it('logs every set of a lift ticked as a whole', () => {
    expect(toEntry(bench(withDone(true)))).toMatchObject({ sets: 3, weight: 60, reps: 8 });
  });

  it('folds sets that came out the same', () => {
    const entry = toEntry(bench({ setWeights: [60, 60, 70], ticks: [true, true, false], done: true }));
    expect(entry).toMatchObject({ sets: 2, weight: 60 });
    expect(entry.setWeights).toBeUndefined();
    expect(varies(bench({ setWeights: [60, 60, 70] }))).toBe(true);
  });
});

describe('drop sets', () => {
  it('marks the last set from the list layout, and clears every mark when turned off', () => {
    const marked = { ...bench(), ...withLastDrop(bench(), true) };
    expect(dropsOf(marked)).toEqual([false, false, true]);
    expect(withLastDrop({ ...marked, ...withDrop(marked, 0, true) }, false)).toEqual({ setDrops: undefined });
  });

  it('keeps a last-set mark on the last set when the sets change', () => {
    const marked = { ...bench(), ...withLastDrop(bench(), true) };
    expect(withSetCount(marked, 4).setDrops).toEqual([false, false, false, true]);
    expect(withSetCount(marked, 2).setDrops).toEqual([false, true]);
    const first = { ...bench(), ...withDrop(bench(), 0, true) };
    expect(withSetCount(first, 4).setDrops).toEqual([true, false, false, false]);
  });

  it('logs the marks of the sets that were done', () => {
    const draft = { ...bench(), ...withTick(bench(), 0, true), ...withDrop(bench(), 1, true) };
    const done = { ...draft, ...withTick(draft, 1, true) };
    expect(toEntry(done)).toMatchObject({ sets: 2, setDrops: [false, true] });
    expect('setDrops' in toEntry({ ...done, ...withDrop(done, 1, false) })).toBe(false);
  });

  it('suggests about a fifth less each drop, on the plates there are', () => {
    expect(dropWeight(100, 2.5, 1)).toBe(80);
    expect(dropWeight(100, 2.5, 2)).toBe(62.5);
    expect(dropWeight(10, 5, 3)).toBe(5);
  });
});

describe('setMax', () => {
  it('scores one set, and refuses a joke', () => {
    expect(setMax(bench(), 60, 1)).toBe(60);
    expect(setMax(bench(), 1600, 1)).toBeNull();
    expect(setMax(bench({ perSide: true }), 800, 1)).toBeNull();
  });
});

describe('warmupSets', () => {
  it('ramps up in the gym’s jumps and stops short of the working weight', () => {
    expect(warmupSets(100, 2.5)).toEqual([{ weight: 50, reps: 5 }, { weight: 70, reps: 3 }, { weight: 85, reps: 1 }]);
    expect(warmupSets(61, 5)).toEqual([{ weight: 30, reps: 5 }, { weight: 40, reps: 3 }, { weight: 50, reps: 1 }]);
    expect(warmupSets(40, 20)).toEqual([{ weight: 20, reps: 5 }]);
  });
});

describe('supersets, set by set', () => {
  const a = (ticks: boolean[]) => bench({ id: 'a', sets: ticks.length, ticks, supersetWithNext: true });
  const b = (ticks: boolean[]) => bench({ id: 'b', sets: ticks.length, ticks });
  const c = bench({ id: 'c', ticks: [false, false, false] });

  it('goes straight on to the partner, then rests and comes back', () => {
    expect(afterSet([a([true, false, false]), b([false, false, false]), c], 'a')).toEqual({ next: 'b', rest: false });
    expect(afterSet([a([true, false, false]), b([true, false, false]), c], 'b')).toEqual({ next: 'a', rest: true });
  });

  it('keeps going on the lift with more sets once its partner is done', () => {
    expect(afterSet([a([true, true, true]), b([true, true, true, false]), c], 'b')).toEqual({ next: 'b', rest: true });
    expect(afterSet([a([true, true, false]), b([true, true]), c], 'a')).toEqual({ next: 'a', rest: true });
  });

  it('is done when every lift in the pair is', () => {
    expect(afterSet([a([true, true, true]), b([true, true, true]), c], 'b')).toEqual({ next: null, rest: true });
  });

  it('leaves a lift on its own where it was', () => {
    expect(afterSet([a([true, false, false]), b([false, false, false]), c], 'c')).toEqual({ next: 'c', rest: true });
  });
});
