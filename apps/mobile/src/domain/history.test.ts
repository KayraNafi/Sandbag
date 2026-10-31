import type { Entry, LoggedWorkout, SavedWorkout } from '@sandbag/shared';
import { describe, expect, it } from 'vitest';
import { activeLogged, bestBefore, buildHistory, draftEntryFor, lastLogged, nextWorkout, recentWeights, sameExercises } from './history';

const entry = (name: string, weight: number | null, extra: Partial<Entry> = {}): Entry => ({
  id: `${name}-${weight}`, name, kind: 'strength', sets: 3, reps: 8, weight, perSide: false, rpe: 8, minutes: null, note: '', ...extra,
});
const logged = (id: string, date: string, entries: Entry[], savedWorkoutId: string | null = null): LoggedWorkout => ({
  id, date, title: id, savedWorkoutId, entries, updatedAt: 1, deleted: false,
});
const saved = (id: string, position: number): SavedWorkout => ({
  id, name: id, position, exercises: [], savedFrom: null, updatedAt: 1, deleted: false,
});

const workouts = activeLogged({
  a: logged('a', '2026-10-16', [entry('Cable curls', 11.3)], 'upper'),
  b: logged('b', '2026-10-20', [entry('cable CURLS', 13.6)], 'lower'),
  c: { ...logged('c', '2026-10-25', [entry('Cable curls', 99)]), deleted: true },
});

describe('history', () => {
  const index = buildHistory(workouts);

  it('merges names case-insensitively, skips deleted, and keeps oldest first', () => {
    expect(index.get('cable curls')?.log.map((item) => item.weight)).toEqual([11.3, 13.6]);
  });

  it('finds the last number overall and before a date', () => {
    expect(lastLogged(index, 'Cable curls')?.weight).toBe(13.6);
    expect(lastLogged(index, 'Cable curls', '2026-10-20')?.weight).toBe(11.3);
    expect(lastLogged(index, 'Unknown')).toBeNull();
  });

  it('finds the best before a date, so today can beat it', () => {
    expect(bestBefore(index, 'Cable curls', '2026-10-30')).toBe(13.6);
    expect(bestBefore(index, 'Cable curls', '2026-10-16')).toBeNull();
  });

  it('offers past weights in order', () => {
    expect(recentWeights(index, 'Cable curls')).toEqual([11.3, 13.6]);
  });
});

describe('nextWorkout', () => {
  const rotation = [saved('upper', 0), saved('lower', 1)];

  it('starts at the top, then alternates and loops', () => {
    expect(nextWorkout(rotation, [])?.id).toBe('upper');
    expect(nextWorkout(rotation, workouts)?.id).toBe('upper');
    expect(nextWorkout(rotation, [logged('x', '2026-10-30', [], 'upper')])?.id).toBe('lower');
  });

  it('ignores workouts logged without a saved workout', () => {
    expect(nextWorkout(rotation, [logged('free', '2026-10-30', []), logged('y', '2026-10-29', [], 'upper')])?.id).toBe('lower');
  });

  it('copes with no saved workouts', () => {
    expect(nextWorkout([], workouts)).toBeNull();
  });
});

describe('draftEntryFor', () => {
  it('loads your own latest numbers, never a friend’s', () => {
    const index = buildHistory(workouts);
    const known = draftEntryFor(index, { name: 'Cable curls', kind: 'strength', sets: 5, reps: 5 }, () => 'id');
    expect(known).toMatchObject({ weight: 13.6, sets: 3, reps: 8, done: false });
    const unknown = draftEntryFor(index, { name: 'Bench Press', kind: 'strength', sets: 5, reps: 5 }, () => 'id');
    expect(unknown).toMatchObject({ weight: null, sets: 5, reps: 5 });
  });
});

describe('sameExercises', () => {
  it('ignores order and case', () => {
    expect(sameExercises([{ name: 'A' }, { name: 'b' }], [{ name: 'B' }, { name: 'a' }])).toBe(true);
    expect(sameExercises([{ name: 'A' }], [{ name: 'B' }])).toBe(false);
  });
});
