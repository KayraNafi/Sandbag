import { describe, expect, it } from 'vitest';
import { CALL_POINTS, cappedCallPoints, exposesSandbag, judgeCall, liftIn } from './calls';
import { estimatedMax } from './strength';
import type { Entry } from './schemas';

const entry = (name: string, weight: number | null, reps: number | null, extra: Partial<Entry> = {}): Entry => ({
  id: name, name, kind: 'strength', sets: 3, reps, weight, perSide: false, rpe: null, minutes: null, note: '', ...extra,
});

describe('liftIn', () => {
  it('finds the best strength entry for a lift, by its key', () => {
    const entries = [entry('Bench  press', 60, 8, { rpe: 9 }), entry('bench press', 62.5, 8), entry('Row', 100, 8)];
    expect(liftIn(entries, 'bench press')).toEqual({ max: estimatedMax(62.5, 8), rpe: null });
    expect(liftIn(entries, 'squat')).toBeNull();
    expect(liftIn([entry('Bench press', null, 8)], 'bench press')).toBeNull();
  });
});

describe('judgeCall', () => {
  const target = estimatedMax(60, 8);

  it('clears anything stronger, including more reps at the same weight', () => {
    expect(judgeCall(target, { max: estimatedMax(60, 10), rpe: null })).toBe('cleared');
    expect(judgeCall(target, { max: estimatedMax(65, 6), rpe: null })).toBe('cleared');
  });

  it('fails a match, a far miss, or a close miss that felt easy', () => {
    expect(judgeCall(target, { max: estimatedMax(60, 8), rpe: 10 })).toBe('watching');
    expect(judgeCall(target, { max: estimatedMax(60, 8), rpe: 8 })).toBe('failed');
    expect(judgeCall(target, { max: estimatedMax(55, 6), rpe: 10 })).toBe('failed');
    expect(judgeCall(target, { max: estimatedMax(62.5, 5), rpe: null })).toBe('failed');
  });

  it('watches a close miss at your limit', () => {
    expect(judgeCall(target, { max: estimatedMax(62.5, 5), rpe: 9.5 })).toBe('watching');
  });
});

describe('exposesSandbag', () => {
  it('needs 5% over the target', () => {
    const target = estimatedMax(60, 8);
    expect(exposesSandbag(target, { max: target * 1.05, rpe: null })).toBe(true);
    expect(exposesSandbag(target, { max: target * 1.04, rpe: null })).toBe(false);
  });
});

describe('CALL_POINTS', () => {
  it('pays nothing until a call is settled, and double for a caught sandbag', () => {
    expect(CALL_POINTS.open).toEqual({ target: 0, caller: 0 });
    expect(CALL_POINTS.watching).toEqual({ target: 0, caller: 0 });
    expect(CALL_POINTS.caught.caller).toBe(CALL_POINTS.failed.caller * 2);
  });
});

describe('cappedCallPoints', () => {
  it('caps each week at 10 either way, and adds the weeks up', () => {
    const week = (monday: string, ...points: number[]) => points.map((value) => ({ monday, points: value }));
    expect(cappedCallPoints(week('2026-10-26', 5, 5, 5))).toBe(10);
    expect(cappedCallPoints(week('2026-10-26', -5, -10))).toBe(-10);
    expect(cappedCallPoints([...week('2026-10-19', 5, 10), ...week('2026-10-26', 5, -3)])).toBe(12);
  });
});
