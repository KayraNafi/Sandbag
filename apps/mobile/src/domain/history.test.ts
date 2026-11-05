import type { Entry, LoggedWorkout, SavedWorkout } from '@sandbag/shared';
import { describe, expect, it } from 'vitest';
import { activeLogged, bestBefore, buildHistory, draftEntryFor, fitSetReps, lastLogged, moveItem, nextWorkout, recentWeights, sameExercises, volumeOf } from './history';

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
  it('ignores case but not order', () => {
    expect(sameExercises([{ name: 'A' }, { name: 'b' }], [{ name: 'a' }, { name: 'B' }])).toBe(true);
    expect(sameExercises([{ name: 'A' }, { name: 'b' }], [{ name: 'B' }, { name: 'a' }])).toBe(false);
    expect(sameExercises([{ name: 'A' }], [{ name: 'B' }])).toBe(false);
  });
});

describe('a backfilled session', () => {
  const older = logged('older', '2026-10-28', [entry('Squat', 100)]);
  const latest = logged('latest', '2026-11-02', [entry('Squat', 500)]);
  const backfilled = { ...logged('backfilled', '2026-10-30', [entry('Squat', 600)]), updatedAt: 2 };
  const index = buildHistory(activeLogged({ older, latest, backfilled }));

  it('sits in date order, however late it was logged', () => {
    expect(index.get('squat')?.log.map((item) => item.date)).toEqual(['2026-10-28', '2026-10-30', '2026-11-02']);
  });

  it('doesn’t replace the numbers the next session starts from', () => {
    expect(lastLogged(index, 'Squat')?.weight).toBe(500);
  });
});

describe('fitSetReps', () => {
  it('fills from the usual number, and keeps typed values when the sets change', () => {
    expect(fitSetReps([], 3, 8)).toEqual([8, 8, 8]);
    expect(fitSetReps([8, 6], 4, 8)).toEqual([8, 6, 8, 8]);
    expect(fitSetReps([8, 6, 5], 2, 8)).toEqual([8, 6]);
    expect(fitSetReps([null, 6], 2, 8)).toEqual([null, 6]);
  });
});

describe('per-set reps on the next session', () => {
  it('starts from the usual number, not last time’s breakdown', () => {
    const index = buildHistory([logged('w', '2026-01-01', [entry('Squat', 100, { sets: 3, reps: 8, setReps: [8, 8, 6] })])]);
    const next = draftEntryFor(index, { name: 'Squat', kind: 'strength', sets: null, reps: null }, () => 'id');
    expect(next.reps).toBe(8);
    expect(next.setReps).toBeUndefined();
  });
});

describe('moveItem', () => {
  it('moves one place either way and leaves the original alone', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(list, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('stays put at the ends', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('draftEntryFor', () => {
  it('carries the bar or machine choice over from the last session', () => {
    const index = buildHistory([logged('w', '2026-01-01', [entry('Squat', 100, { includesEquipment: false })])]);
    const exercise = { name: 'Squat', kind: 'strength' as const, sets: null, reps: null };
    expect(draftEntryFor(index, exercise, () => 'id').includesEquipment).toBe(false);
    expect(draftEntryFor(buildHistory([]), exercise, () => 'id').includesEquipment).toBeUndefined();
  });
});

describe('volumeOf', () => {
  it('adds weight times reps for each set, both sides when it is per side', () => {
    expect(volumeOf({ entries: [entry('Squat', 100, { sets: 3, reps: 5 }), entry('Curl', 10, { sets: 2, reps: 10, perSide: true })] })).toBe(1500 + 400);
  });

  it('uses each set’s reps when they differ', () => {
    expect(volumeOf({ entries: [entry('Bench', 80, { sets: 3, reps: 8, setReps: [8, 6, 4] })] })).toBe(80 * 18);
  });

  it('counts nothing for timed work or a joke weight', () => {
    expect(volumeOf({ entries: [entry('Run', null, { kind: 'time', minutes: 30 }), entry('Bench', 9000, { sets: 1, reps: 1 })] })).toBe(0);
  });
});
