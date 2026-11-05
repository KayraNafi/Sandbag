import type { Entry } from '@sandbag/shared';
import { describe, expect, it } from 'vitest';
import type { ExerciseHistory } from './history';
import { changePercent, dailyPoints, liftProgress } from './progress';

const item = (date: string, weight: number | null, extra: Partial<Entry> = {}) => ({
  id: date, name: 'Curl', kind: 'strength' as const, sets: 3, reps: 8, weight, perSide: false, rpe: null, minutes: null, note: '', date, workoutId: 'w', ...extra,
});
const lift = (key: string, log: ExerciseHistory['log']): ExerciseHistory => ({ key, name: key, log });

describe('progress', () => {
  it('keeps the best per day and skips unweighted sessions', () => {
    const history = lift('curl', [item('2026-10-01', 10), item('2026-10-01', 12), item('2026-10-03', null), item('2026-10-05', 15)]);
    expect(dailyPoints(history)).toEqual([{ date: '2026-10-01', value: 12 }, { date: '2026-10-05', value: 15 }]);
  });

  it('charts a lift by what it is logged as now', () => {
    const history = lift('rope', [item('2026-10-01', 10), item('2026-10-02', null, { kind: 'time', minutes: 5 })]);
    expect(dailyPoints(history)).toEqual([{ date: '2026-10-02', value: 5 }]);
  });

  it('handles losses and a zero start', () => {
    expect(changePercent(100, 90)).toBe(-10);
    expect(changePercent(0, 20)).toBe(0);
  });

  it('needs two days for a trend, and lists the most improved lift first', () => {
    const once = lift('once', [item('2026-10-01', 10)]);
    const some = lift('some', [item('2026-10-01', 10), item('2026-10-02', 11)]);
    const many = lift('many', [item('2026-10-01', 20), item('2026-10-02', 21), item('2026-10-03', 25)]);
    const result = liftProgress(new Map([['once', once], ['some', some], ['many', many]]));
    expect(result.map((row) => row.key)).toEqual(['many', 'some']);
    expect(result[0]?.change).toBe(25);
  });
});
