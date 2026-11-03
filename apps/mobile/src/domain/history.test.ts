import type { Entry, LoggedWorkout, SavedWorkout } from '@sandbag/shared';
import { describe, expect, it } from 'vitest';
import { activeLogged, leftOutOf, trustedEntry, previewLoad, warmupSets, weekRecap, weightToBeat, jumpFor, lastSameWorkout, medalsFor, sessionRank, withJump, bestBefore, buildHistory, draftEntryFor, lastLogged, moveItem, muscleLoad, nextWorkout, recentWeights, rowsOf, sameExercises, sessionLoad, toEntry, volumeOf } from './history';

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
  const latest = logged('latest', '2026-11-02', [entry('Squat', 200)]);
  const backfilled = { ...logged('backfilled', '2026-10-30', [entry('Squat', 300)]), updatedAt: 2 };
  const index = buildHistory(activeLogged({ older, latest, backfilled }));

  it('sits in date order, however late it was logged', () => {
    expect(index.get('squat')?.log.map((item) => item.date)).toEqual(['2026-10-28', '2026-10-30', '2026-11-02']);
  });

  it('doesn’t replace the numbers the next session starts from', () => {
    expect(lastLogged(index, 'Squat')?.weight).toBe(200);
  });
});

describe('per-set reps on the next session', () => {
  it('prefills each set from last time, without carrying the list over as logged', () => {
    const index = buildHistory([logged('w', '2026-01-01', [entry('Squat', 80, { sets: 3, reps: 8, setReps: [8, 8, 6], setWeights: [60, 70, 80] })])]);
    const next = draftEntryFor(index, { name: 'Squat', kind: 'strength', sets: null, reps: null }, () => 'id');
    expect(next.reps).toBe(8);
    expect(next.setReps).toBeUndefined();
    expect(next.rows).toEqual([{ weight: 60, reps: 8, done: false }, { weight: 70, reps: 8, done: false }, { weight: 80, reps: 6, done: false }]);
  });

  it('never carries last session’s effort or note into this one', () => {
    const index = buildHistory([logged('w', '2026-01-01', [entry('Squat', 100, { rpe: 10, note: 'never again' })])]);
    const next = draftEntryFor(index, { name: 'Squat', kind: 'strength', sets: null, reps: null }, () => 'id');
    expect(next.rpe).toBeNull();
    expect(next.note).toBe('');
  });

  it('knows a catalog lift’s setup and gives a first-timer somewhere to start', () => {
    const next = draftEntryFor(buildHistory([]), { name: 'db curl', kind: 'strength', sets: null, reps: null }, () => 'id');
    expect(next).toMatchObject({ name: 'Dumbbell curl', perSide: true, sets: 3, reps: 8, weight: null });
    expect(next.rows).toHaveLength(3);
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

describe('rows to a saved entry', () => {
  const draft = (rows: { weight: number | null; reps: number | null; done: boolean }[]) => ({ ...entry('Squat', 100), done: true, rows });

  it('saves only the sets ticked', () => {
    const saved = toEntry(draft([{ weight: 100, reps: 8, done: true }, { weight: 100, reps: 8, done: true }, { weight: 100, reps: 8, done: false }]));
    expect(saved).toMatchObject({ sets: 2, weight: 100, reps: 8 });
    expect(saved.setWeights).toBeUndefined();
    expect(saved.setReps).toBeUndefined();
    expect('rows' in saved).toBe(false);
    expect('done' in saved).toBe(false);
  });

  it('keeps per-set lists when the sets differ, with the heaviest as the weight', () => {
    const saved = toEntry(draft([{ weight: 60, reps: 10, done: true }, { weight: 80, reps: 6, done: true }]));
    expect(saved).toMatchObject({ sets: 2, weight: 80, reps: 10, setWeights: [60, 80], setReps: [10, 6] });
  });

  it('drops stale lists when the sets end up the same', () => {
    const saved = toEntry({ ...draft([{ weight: 80, reps: 6, done: true }]), setWeights: [1, 2], setReps: [3, 4] });
    expect(saved.setWeights).toBeUndefined();
    expect(saved.setReps).toBeUndefined();
  });

  it('copes with a draft saved before sets had rows', () => {
    const old = { ...entry('Squat', 100, { sets: 2, reps: 5 }), done: true };
    expect(rowsOf(old)).toEqual([{ weight: 100, reps: 5, done: true }, { weight: 100, reps: 5, done: true }]);
    expect(toEntry(old)).toMatchObject({ sets: 2, weight: 100, reps: 5 });
  });
});

describe('muscleLoad', () => {
  it('counts the main muscle most, tops out, and ignores lifts it doesn’t know', () => {
    const load = muscleLoad([logged('w', '2026-01-01', [entry('Bench press', 100, { sets: 4 }), entry('Mystery', 10)])]);
    expect(load.chest).toBeCloseTo(0.4);
    expect(load.triceps).toBeCloseTo(0.2);
    expect(load.quads).toBeUndefined();
    expect(muscleLoad([logged('w', '2026-01-01', [entry('Bench press', 100, { sets: 50 })])]).chest).toBe(1);
  });
});

describe('sessionLoad', () => {
  const entry = (name: string, sets: number) => ({ id: name, name, kind: 'strength', sets, reps: 8, weight: 50, perSide: false, rpe: null, minutes: null, note: '' }) as Entry;

  it('fills whatever the session hit hardest, however few sets it was', () => {
    const load = sessionLoad({ entries: [entry('Pec deck', 2)] });
    expect(load.chest).toBe(1);
  });

  it('measures the rest from there', () => {
    const load = sessionLoad({ entries: [entry('Bench press', 4)] });
    expect(load.chest).toBe(1);
    expect(load.triceps).toBe(0.5);
  });

  it('has nothing to say about an empty session', () => {
    expect(sessionLoad({ entries: [] })).toEqual({});
  });
});

describe('weight jumps', () => {
  it('starts from what that kit usually does', () => {
    expect(jumpFor({}, 'Bench press')).toBe(2.5);
    expect(jumpFor({}, 'Leg press')).toBe(5);
  });

  it('remembers a lift, and lets others on the same kit start there', () => {
    const jumps = withJump({}, 'Bench press', 5);
    expect(jumpFor(jumps, 'bench press')).toBe(5);
    expect(jumpFor(jumps, 'Squat')).toBe(5);
      });

  it('keeps a lift’s own jump when another on its kit changes', () => {
    const jumps = withJump(withJump({}, 'Bench press', 5), 'Squat', 10);
    expect(jumpFor(jumps, 'Bench press')).toBe(5);
    expect(jumpFor(jumps, 'Squat')).toBe(10);
    expect(jumpFor(jumps, 'Deadlift')).toBe(10);
  });
});

describe('weightToBeat', () => {
  it('finds the nearest weight that would be a new best', () => {
    expect(weightToBeat(100, 5, 2.5, 113.5)).toBe(102.5);
    expect(weightToBeat(100, 5, 5, 118)).toBe(105);
  });

  it('won’t suggest a jump that’s out of reach today', () => {
    expect(weightToBeat(60, 5, 2.5, 200)).toBeNull();
  });
});

describe('previewLoad', () => {
  it('hits nothing, rather than breaking, when a plan has no sets', () => {
    expect(Object.values(previewLoad([{ name: 'Squat', sets: 0 }])).every((value) => value === 0)).toBe(true);
  });
});

describe('medalsFor', () => {
  const lift = (weight: number) => ({ id: `e${weight}`, name: 'Squat', kind: 'strength', sets: 1, reps: 5, weight, perSide: false, rpe: null, minutes: null, note: '' }) as Entry;
  const day = (id: string, date: string, weight: number) => logged(id, date, [lift(weight)]);
  const past = [day('a', '2026-10-01', 100), day('b', '2026-10-02', 90), day('c', '2026-10-03', 80), day('d', '2026-10-04', 70)];

  it('gives gold to a new best, and says what it beat', () => {
    const today = day('t', '2026-10-10', 105);
    const [medal] = medalsFor([...past, today], today);
    expect(medal?.place).toBe(1);
    expect(medal?.was?.weight).toBe(100);
  });

  it('gives silver and bronze once there’s a history to rank against', () => {
    const second = day('t', '2026-10-10', 95);
    const third = day('t', '2026-10-10', 85);
    expect(medalsFor([...past, second], second)[0]?.place).toBe(2);
    expect(medalsFor([...past, third], third)[0]?.place).toBe(3);
    const short = [day('a', '2026-10-01', 100), day('b', '2026-10-02', 90)];
    const close = day('t', '2026-10-10', 95);
    expect(medalsFor([...short, close], close)).toEqual([]);
  });

  it('gives nothing for fourth place, a tie with the best, or a first go', () => {
    const fourth = day('t', '2026-10-10', 75);
    expect(medalsFor([...past, fourth], fourth)).toEqual([]);
    const tie = day('t', '2026-10-10', 100);
    expect(medalsFor([...past, tie], tie)[0]?.place).toBe(2);
    const first = day('t', '2026-10-10', 100);
    expect(medalsFor([first], first)).toEqual([]);
  });

  it('doesn’t count a later session against an earlier one, or the same lift twice', () => {
    const today = logged('t', '2026-10-05', [lift(60), lift(110)]);
    const medals = medalsFor([...past, day('z', '2026-10-20', 500), today], today);
    expect(medals).toHaveLength(1);
    expect(medals[0]?.entry.weight).toBe(110);
    expect(medals[0]?.place).toBe(1);
  });
});

describe('sessionRank', () => {
  const lift = (weight: number) => ({ id: `e${weight}`, name: 'Squat', kind: 'strength', sets: 1, reps: 5, weight, perSide: false, rpe: null, minutes: null, note: '' }) as Entry;

  it('counts the sessions at or above this one', () => {
    const big = logged('a', '2026-10-01', [lift(100)], 'plan');
    const small = logged('b', '2026-10-02', [lift(50)], 'plan');
    const today = logged('c', '2026-10-03', [lift(75)], 'plan');
    expect(sessionRank([big, small, today], today)).toBe(2);
    expect(sessionRank([small, today], today)).toBe(1);
  });
});

describe('lastSameWorkout', () => {
  const session = (id: string, date: string, extra: Partial<LoggedWorkout> = {}): LoggedWorkout => ({ id, date, title: 'Lower', savedWorkoutId: 'plan', entries: [], updatedAt: 1, deleted: false, ...extra });

  it('finds the latest earlier session of the same plan', () => {
    const today = session('c', '2026-11-03');
    const found = lastSameWorkout([session('a', '2026-10-01'), session('b', '2026-10-20'), session('x', '2026-11-01', { savedWorkoutId: 'other' }), today], today);
    expect(found?.id).toBe('b');
  });

  it('matches by name when there’s no plan, and ignores deleted and later sessions', () => {
    const today = session('c', '2026-11-03', { savedWorkoutId: null, title: 'Arms' });
    const earlier = session('a', '2026-10-01', { savedWorkoutId: null, title: 'Arms' });
    const gone = session('b', '2026-10-20', { savedWorkoutId: null, title: 'Arms', deleted: true });
    const later = session('d', '2026-11-05', { savedWorkoutId: null, title: 'Arms' });
    expect(lastSameWorkout([earlier, gone, later, today], today)?.id).toBe('a');
    expect(lastSameWorkout([today], today)).toBeNull();
  });
});

describe('volumeOf', () => {
  const entry = (changes: Partial<Entry>) => ({ id: 'a', name: 'Squat', kind: 'strength', sets: 3, reps: 8, weight: 50, perSide: false, rpe: null, minutes: null, note: '', ...changes }) as Entry;

  it('adds up weight times reps across the sets', () => {
    expect(volumeOf({ entries: [entry({})] })).toBe(1200);
  });

  it('follows sets that differ', () => {
    expect(volumeOf({ entries: [entry({ sets: 2, setWeights: [60, 40], setReps: [5, 10] })] })).toBe(700);
  });

  it('counts both sides of a per-side lift', () => {
    expect(volumeOf({ entries: [entry({ perSide: true, sets: 1 })] })).toBe(800);
  });

  it('counts one set when none were logged, rather than guessing', () => {
    expect(volumeOf({ entries: [entry({ sets: null })] })).toBe(400);
  });

  it('leaves out timed work and bodyweight', () => {
    expect(volumeOf({ entries: [entry({ kind: 'time', minutes: 20 }), entry({ weight: null })] })).toBe(0);
  });
});

describe('warmupSets', () => {
  it('climbs from the bar to just under the working weight', () => {
    expect(warmupSets(100, 2.5, 20)).toEqual([{ weight: 20, reps: 10 }, { weight: 50, reps: 5 }, { weight: 70, reps: 3 }, { weight: 85, reps: 1 }]);
  });

  it('rounds down to what the gym can actually load', () => {
    expect(warmupSets(50, 5).map((set) => set.weight)).toEqual([25, 35, 40]);
  });

  it('never repeats a weight or reaches the working one', () => {
    expect(warmupSets(25, 2.5, 20).map((set) => set.weight)).toEqual([20]);
    expect(warmupSets(20, 2.5, 20)).toEqual([]);
    expect(warmupSets(5, 5)).toEqual([]);
  });
});

describe('weekRecap', () => {
  const session = (id: string, date: string, weight: number) => ({ ...logged(id, date, [{ ...entry('Squat', weight), sets: 3, reps: 5 }]) });

  it('adds up one week and compares it with the one before', () => {
    const list = [session('c', '2026-10-28', 110), session('b', '2026-10-26', 100), session('a', '2026-10-20', 90)];
    const recap = weekRecap(list, '2026-10-26');
    expect(recap.sessions.map((item) => item.id)).toEqual(['c', 'b']);
    expect(recap.moved).toBe(volumeOf(list[0]!) + volumeOf(list[1]!));
    expect(recap.movedBefore).toBe(volumeOf(list[2]!));
    expect(recap.days).toBe(2);
    expect(recap.sets).toBe(6);
  });

  it('counts a lift beaten twice as one best, at the later number', () => {
    const list = [session('c', '2026-10-28', 110), session('b', '2026-10-26', 100), session('a', '2026-10-20', 90)];
    const { bests } = weekRecap(list, '2026-10-26');
    expect(bests).toHaveLength(1);
    expect(bests[0]?.entry.weight).toBe(110);
  });

  it('has nothing to say about an empty week', () => {
    expect(weekRecap([session('a', '2026-10-20', 90)], '2026-10-26').sessions).toEqual([]);
  });
});

describe('numbers nobody believes', () => {
  const joke = { ...entry('Romanian deadlift', 1620), sets: 5, reps: 17 };
  const real = { ...entry('Leg press', 82.5), sets: 3, reps: 8 };
  const owners = logged('joke', '2026-11-03', [joke, real]);
  const earlier = logged('old', '2026-10-20', [{ ...entry('Romanian deadlift', 100), sets: 3, reps: 8 }]);

  it('leaves them out of what was moved', () => {
    expect(volumeOf(owners)).toBe(1980);
    expect(volumeOf({ entries: [joke] })).toBe(0);
  });

  it('says what it left out, and keeps what was typed', () => {
    expect(leftOutOf(owners)).toEqual([{ name: 'Romanian deadlift', weight: 1620 }]);
    expect(owners.entries[0]?.weight).toBe(1620);
  });

  it('never suggests one next time', () => {
    const index = buildHistory([owners, earlier]);
    expect(lastLogged(index, 'Romanian deadlift')?.weight).toBe(100);
    expect(recentWeights(index, 'Romanian deadlift')).toEqual([100]);
    expect(draftEntryFor(index, { name: 'Romanian deadlift', kind: 'strength', sets: null, reps: null }, () => 'id').weight).toBe(100);
  });

  it('never gives one a medal, and real bests still count after one', () => {
    expect(medalsFor([owners, earlier], owners)).toEqual([]);
    const after = logged('new', '2026-11-04', [{ ...entry('Romanian deadlift', 110), sets: 3, reps: 8 }]);
    expect(medalsFor([after, owners, earlier], after)[0]?.place).toBe(1);
  });

  it('keeps the real sets of a lift with one slipped zero', () => {
    const slipped = { ...entry('Squat', 1000), sets: 3, reps: 5, setWeights: [100, 1000, 100], setReps: [5, 5, 5] };
    const trusted = trustedEntry(slipped);
    expect(trusted?.weight).toBe(100);
    expect(trusted?.sets).toBe(2);
    expect(volumeOf({ entries: [slipped] })).toBe(1000);
  });

  it('leaves believable entries exactly as they were', () => {
    expect(trustedEntry(real)).toBe(real);
  });

  it('keeps a joke out of the weekly recap', () => {
    const recap = weekRecap([owners], '2026-11-02');
    expect(recap.moved).toBe(1980);
    expect(recap.sets).toBe(3);
    expect(recap.bests).toEqual([]);
  });

  it('stays a sane number, whatever is thrown at it', () => {
    const absurd = Array.from({ length: 100 }, (_, at) => ({ ...entry(`Lift ${at}`, 2000), sets: 20, reps: 1000 }));
    expect(volumeOf({ entries: absurd })).toBe(0);
    const biggest = Array.from({ length: 100 }, (_, at) => ({ ...entry(`Lift ${at}`, 500), sets: 20, reps: 40 }));
    expect(Number.isSafeInteger(volumeOf({ entries: biggest }))).toBe(true);
  });
});
