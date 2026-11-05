import { describe, expect, it } from 'vitest';
import type { Entry } from './schemas';
import { bestSet, entryMax, entrySetup, estimatedMax, hasWork, setsOf, tidySets } from './strength';

const entry = (name: string, weight: number | null, reps: number | null, extra: Partial<Entry> = {}): Entry => ({
  id: name, name, kind: 'strength', sets: 3, reps, weight, perSide: false, rpe: null, minutes: null, note: '', ...extra,
});

describe('estimatedMax', () => {
  it('counts more reps at the same weight as stronger, up to 12', () => {
    expect(estimatedMax(60, 10)).toBeGreaterThan(estimatedMax(60, 8));
    expect(estimatedMax(60, 20)).toBe(estimatedMax(60, 12));
    expect(estimatedMax(100, 1)).toBe(100);
    expect(estimatedMax(100, null)).toBe(100);
  });

  it('uses the best set when sets differ', () => {
    expect(entryMax(entry('Bench', 60, 8, { setReps: [8, 10, 6] }))).toBe(estimatedMax(60, 10));
    expect(entryMax(entry('Bench', null, 8))).toBeNull();
  });
});

describe('per-set weights', () => {
  const ramp = entry('Bench', 70, 8, { setWeights: [60, 65, 70], setReps: [10, 8, 5] });

  it('reads each set as it was done', () => {
    expect(setsOf(ramp)).toEqual([{ weight: 60, reps: 10 }, { weight: 65, reps: 8 }, { weight: 70, reps: 5 }]);
    expect(setsOf(entry('Bench', 60, 8))).toEqual([{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }]);
  });

  it('scores the best real set, never the heaviest weight with the most reps', () => {
    expect(bestSet(ramp)).toEqual({ weight: 65, reps: 8, max: estimatedMax(65, 8) });
    expect(entryMax(ramp)).toBeLessThan(estimatedMax(70, 10));
  });

  it('ignores a list that does not match the number of sets', () => {
    expect(setsOf(entry('Bench', 60, 8, { setWeights: [100, 100] }))[0]).toEqual({ weight: 60, reps: 8 });
  });

  it('skips an impossible set but keeps the believable ones', () => {
    expect(bestSet(entry('Bench', 2000, 1, { setWeights: [60, 2000, 70], setReps: [5, 1, 5] }))?.weight).toBe(70);
  });
});

describe('tidySets', () => {
  it('keeps lists that vary and makes the weight the heaviest set', () => {
    const tidy = tidySets(entry('Bench', 60, 8, { setWeights: [60, 65, 70], setReps: [8, 8, 8] }));
    expect(tidy.setWeights).toEqual([60, 65, 70]);
    expect(tidy.weight).toBe(70);
    expect(tidy.setReps).toBeUndefined();
    expect(tidy.reps).toBe(8);
  });

  it('folds a list where every set is the same into the single number', () => {
    const tidy = tidySets(entry('Bench', 50, 10, { setWeights: [60, 60, 60], setReps: [6, 6, 6] }));
    expect(tidy).toMatchObject({ weight: 60, reps: 6 });
    expect('setWeights' in tidy || 'setReps' in tidy).toBe(false);
  });

  it('drops a list left behind when the sets changed', () => {
    const tidy = tidySets(entry('Bench', 60, 8, { setWeights: [60, 70] }));
    expect(tidy.setWeights).toBeUndefined();
    expect(tidy.weight).toBe(60);
  });

  it('keeps drop-set marks only when a set has one', () => {
    expect(tidySets(entry('Curl', 20, 10, { setDrops: [false, false, true] })).setDrops).toEqual([false, false, true]);
    expect('setDrops' in tidySets(entry('Curl', 20, 10, { setDrops: [false, false, false] }))).toBe(false);
    expect('setDrops' in tidySets(entry('Curl', 20, 10, { setDrops: [true, true] }))).toBe(false);
  });
});

describe('believable sets', () => {
  it('ignores impossible numbers and zero reps', () => {
    expect(entryMax(entry('Bench', 2000, 1))).toBeNull();
    expect(entryMax(entry('Curl', 500, 41))).toBeNull();
    expect(entryMax(entry('Bench', 60, 0))).toBeNull();
    expect(entryMax(entry('Leg press', 400, 10))).not.toBeNull();
  });

  it('counts a per-side weight twice', () => {
    expect(entryMax(entry('Bench', 800, 1, { perSide: true }))).toBeNull();
  });
});

describe('entrySetup', () => {
  it('tells per side and bar included apart', () => {
    expect(entrySetup({ perSide: true })).not.toBe(entrySetup({ perSide: false }));
    expect(entrySetup({ includesEquipment: true })).not.toBe(entrySetup({}));
  });
});

describe('hasWork', () => {
  it('needs a believable number, reps, or minutes', () => {
    expect(hasWork(entry('Bench', null, null))).toBe(false);
    expect(hasWork(entry('Pull-up', null, 8))).toBe(true);
    expect(hasWork(entry('Bench', 5000, 1))).toBe(false);
    expect(hasWork({ ...entry('Bike', null, null), kind: 'time', minutes: 20 })).toBe(true);
  });
});
