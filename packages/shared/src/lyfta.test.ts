import { describe, expect, it } from 'vitest';
import { connectIntegrationSchema } from './integrations';
import { INTEGRATIONS } from './providers';
import { fromLyfta, lyftaWorkoutSchema, type LyftaWorkout } from './lyfta';
import { loggedWorkoutSchema } from './schemas';

// The shape of Lyfta's sandbox sample, trimmed.
const sample = (): LyftaWorkout => lyftaWorkoutSchema.parse({
  id: 1001,
  title: 'Upper Strength',
  body_weight: 82,
  workout_perform_date: '2026-08-20T17:05:00.000Z',
  exercises: [
    {
      exercise_id: 2, excercise_name: 'Bench Press', exercise_type: 'weight_reps',
      sets: [
        { id: 's1', weight: '80', reps: '5', rir: '2', duration: '', distance: '', set_type_id: '1', is_completed: true },
        { id: 's2', weight: '90', reps: '3', rir: '1', duration: '', distance: '', set_type_id: '1', is_completed: true },
      ],
    },
  ],
});

describe('fromLyfta', () => {
  it('makes a session that passes the same checks as one logged in the app', () => {
    const workout = fromLyfta(sample(), 'kg', null)!;
    expect(loggedWorkoutSchema.parse({ ...workout, updatedAt: 1 })).toBeTruthy();
    expect(workout).toMatchObject({ id: 'lyfta-1001', date: '2026-08-20', title: 'Upper Strength' });
  });

  it('takes the catalog’s name and keeps each set’s weight and reps', () => {
    const [bench] = fromLyfta(sample(), 'kg', null)!.entries;
    expect(bench).toMatchObject({ id: 'lyfta-1001-0', name: 'Bench press', sets: 2, setReps: [5, 3], setWeights: [80, 90], weight: 90 });
  });

  it('turns the hardest set’s reps in reserve into effort', () => {
    expect(fromLyfta(sample(), 'kg', null)!.entries[0]!.rpe).toBe(9);
  });

  it('converts pounds', () => {
    const [bench] = fromLyfta(sample(), 'lb', null)!.entries;
    expect(bench!.setWeights).toEqual([36.29, 40.82]);
  });

  it('dates the session in the lifter’s own time zone', () => {
    const late = { ...sample(), workout_perform_date: '2026-08-20T23:30:00.000Z' };
    expect(fromLyfta(late, 'kg', 'Africa/Cairo')!.date).toBe('2026-08-21');
  });

  it('leaves out unfinished sets, and exercises with no reps', () => {
    const workout = lyftaWorkoutSchema.parse({
      id: '7', title: '', workout_perform_date: '2026-08-20T10:00:00Z',
      exercises: [
        { excercise_name: 'Squat', sets: [{ weight: '100', reps: '5', is_completed: true }, { weight: '100', reps: '5', is_completed: false }] },
        { excercise_name: 'Plank', sets: [{ weight: '', reps: '', is_completed: true }] },
      ],
    });
    const mapped = fromLyfta(workout, 'kg', null)!;
    expect(mapped.title).toBe('Workout');
    expect(mapped.entries).toHaveLength(1);
    expect(mapped.entries[0]).toMatchObject({ name: 'Squat', sets: 1, reps: 5, weight: 100, rpe: null });
  });

  it('keeps a name the catalog doesn’t know as written, and logs bodyweight sets without a weight', () => {
    const workout = lyftaWorkoutSchema.parse({
      id: 8, workout_perform_date: '2026-08-20T10:00:00Z',
      exercises: [{ excercise_name: ' Muscle-up ladder ', sets: [{ weight: '0', reps: '4' }, { weight: '', reps: '3' }] }],
    });
    expect(fromLyfta(workout, 'kg', null)!.entries[0]).toMatchObject({ name: 'Muscle-up ladder', weight: null, setReps: [4, 3] });
  });

  it('has nothing to log for a workout with no finished sets', () => {
    const empty = lyftaWorkoutSchema.parse({ id: 9, workout_perform_date: '2026-08-20T10:00:00Z', exercises: [] });
    expect(fromLyfta(empty, 'kg', null)).toBeNull();
  });
});

describe('the Lyfta provider', () => {
  it('reads a workout as Lyfta sends it, and nothing that isn’t one', () => {
    const { lyfta } = INTEGRATIONS;
    const settings = lyfta.settingsSchema.parse({ unit: 'kg' });
    expect(lyfta.toWorkout(sample(), settings, null)?.id).toBe('lyfta-1001');
    expect(lyfta.toWorkout({ nonsense: true }, settings, null)).toBeNull();
    expect(() => lyfta.settingsSchema.parse({ unit: 'stone' })).toThrow();
  });
});

describe('connectIntegrationSchema', () => {
  it('trims a pasted key and refuses one with spaces inside', () => {
    expect(connectIntegrationSchema.parse({ key: '  abc123def456  ', settings: {} }).key).toBe('abc123def456');
    expect(() => connectIntegrationSchema.parse({ key: 'abc 123 def 456', settings: {} })).toThrow();
  });
});
