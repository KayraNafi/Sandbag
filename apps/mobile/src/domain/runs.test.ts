import type { LoggedWorkout, Run } from '@sandbag/shared';
import { describe, expect, it } from 'vitest';
import { activeRuns, fromSeconds, pace, runSummary, timeline, toSeconds } from './runs';

const run = (id: string, date: string, extra: Partial<Run> = {}): Run => ({
  id, date, activity: 'run', distanceKm: 10, seconds: 3150, note: '', updatedAt: 1, deleted: false, ...extra,
});

describe('runs', () => {
  it('gives pace per kilometre', () => {
    expect(pace({ distanceKm: 10, seconds: 3150 })).toBe('5:15 /km');
    expect(runSummary({ distanceKm: 42.195, seconds: 4 * 3600 })).toBe('42.2 km · 4:00:00 · 5:41 /km');
  });

  it('turns typed hours, minutes and seconds into seconds and back', () => {
    expect(toSeconds({ hours: 1, minutes: 5, seconds: 30 })).toBe(3930);
    expect(toSeconds({ hours: null, minutes: 25, seconds: null })).toBe(1500);
    expect(toSeconds({ hours: null, minutes: null, seconds: null })).toBeNull();
    expect(fromSeconds(3930)).toEqual({ hours: 1, minutes: 5, seconds: 30 });
  });

  it('leaves out deleted runs, newest first', () => {
    const runs = { a: run('a', '2026-11-01'), b: run('b', '2026-11-03'), c: run('c', '2026-11-04', { deleted: true }) };
    expect(activeRuns(runs).map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('puts sessions and runs in one list by date', () => {
    const workout = { id: 'w', date: '2026-11-02', title: 'Upper', savedWorkoutId: null, entries: [], updatedAt: 1, deleted: false } satisfies LoggedWorkout;
    const items = timeline([workout], [run('a', '2026-11-01'), run('b', '2026-11-03')]);
    expect(items.map((item) => (item.kind === 'run' ? item.run.id : item.workout.id))).toEqual(['b', 'w', 'a']);
  });
});
