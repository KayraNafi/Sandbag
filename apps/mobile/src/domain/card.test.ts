import type { Entry, LoggedWorkout, Run } from '@sandbag/shared';
import { describe, expect, it } from 'vitest';
import { runCard, streakOn, workoutCard } from './card';
import { buildHistory } from './history';

const entry = (name: string, weight: number | null, extra: Partial<Entry> = {}): Entry => ({
  id: `${name}-${weight}`, name, kind: 'strength', sets: 3, reps: 8, weight, perSide: false, rpe: 8, minutes: null, note: '', ...extra,
});
const logged = (id: string, date: string, entries: Entry[]): LoggedWorkout => ({
  id, date, title: id, savedWorkoutId: null, entries, updatedAt: 1, deleted: false,
});
const run = (id: string, date: string, extra: Partial<Run> = {}): Run => ({
  id, date, activity: 'run', distanceKm: 5, seconds: 1500, note: '', updatedAt: 1, deleted: false, ...extra,
});

describe('a session’s card', () => {
  const before = logged('Push', '2026-11-02', [entry('Bench press', 80)]);
  const today = logged('Push', '2026-11-09', [entry('Bench press', 85), entry('Triceps pushdown', 30)]);
  const card = workoutCard(today, { index: buildHistory([today, before]), streak: 3 });

  it('leads with kilos moved, then sets and the streak', () => {
    expect(card.headline).toEqual({ value: '2,760', label: 'KG MOVED' });
    expect(card.facts).toEqual([{ value: '6', label: 'SETS' }, { value: '3', label: 'WEEKS' }]);
  });

  it('lists each lift by its top set, and the ones that beat their best', () => {
    expect(card.lines).toEqual([{ name: 'Bench press', value: '85 × 8' }, { name: 'Triceps pushdown', value: '30 × 8' }]);
    expect(card.bests).toEqual(['Bench press']);
  });

  it('lights the muscles worked, triceps hardest with bench helping the pushdowns', () => {
    expect(card.load).toEqual({ triceps: 1, chest: 3 / 4.5, shoulders: 1.5 / 4.5 });
  });

  it('counts sets when there’s nothing to weigh, and leaves joke weights out', () => {
    const bodyweight = workoutCard(logged('Abs', '2026-11-09', [entry('Plank', null, { kind: 'time', sets: null, minutes: 3 }), entry('Crunch', null)]), { index: new Map(), streak: 1 });
    expect(bodyweight.headline).toEqual({ value: '3', label: 'SETS DONE' });
    expect(bodyweight.facts).toEqual([]);
    // A lift with no count is one set, as everywhere else.
    expect(workoutCard(logged('Quick', '2026-11-09', [entry('Dumbbell bench press', null, { sets: null, reps: null })]), { index: new Map(), streak: 1 }).headline).toEqual({ value: '1', label: 'SET DONE' });
    expect(workoutCard(logged('Lies', '2026-11-09', [entry('Bench press', 1900)]), { index: new Map(), streak: 1 }).headline.label).toBe('SETS DONE');
  });
});

describe('a run’s card', () => {
  it('leads with the distance, and names a new PB', () => {
    const card = runCard(run('b', '2026-11-09', { seconds: 1450 }), [run('a', '2026-11-02')]);
    expect(card.headline).toEqual({ value: '5', label: 'KM' });
    expect(card.facts).toEqual([{ value: '24:10', label: 'TIME' }, { value: '4:50', label: 'MIN/KM' }]);
    expect(card.bests).toEqual(['5k PB']);
    expect(card.load).toBeNull();
  });

  it('only counts earlier runs against it', () => {
    expect(runCard(run('a', '2026-11-02'), [run('a', '2026-11-02'), run('b', '2026-11-09', { seconds: 1450 })]).bests).toEqual([]);
  });
});

describe('the streak on a card', () => {
  it('is the one it was that day', () => {
    const weeks = ['2026-10-20', '2026-10-21', '2026-10-27', '2026-10-28', '2026-11-03', '2026-11-04'].map((date) => logged(date, date, [entry('Squat', 100)]));
    expect(streakOn(weeks, 2, '2026-10-28')).toBe(2);
    expect(streakOn(weeks, 2, '2026-11-04')).toBe(3);
  });
});
