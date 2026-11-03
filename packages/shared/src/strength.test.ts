import { describe, expect, it } from 'vitest';
import type { Entry } from './schemas';
import { entryMax, entrySetup, estimatedMax, hasWork } from './strength';

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
