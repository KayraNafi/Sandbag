import { describe, expect, it } from 'vitest';
import { CATALOG, findLift, liftWords, muscleLoad, nearestLift, searchLifts } from './exercises';

describe('the catalog', () => {
  it('gives every name and other name to exactly one lift', () => {
    const owners = new Map<string, string>();
    for (const item of CATALOG) {
      for (const name of [item.name, ...(item.aka ?? [])]) {
        const words = liftWords(name);
        expect(owners.get(words) ?? item.name, `"${name}" belongs to two lifts`).toBe(item.name);
        owners.set(words, item.name);
      }
      expect(findLift(item.name)?.name).toBe(item.name);
    }
  });

  it('ignores capitals, plurals, hyphens and punctuation', () => {
    expect(liftWords('Cable  Triceps Extension')).toBe('cable tricep extension');
    expect(liftWords('Crunches')).toBe('crunch');
    expect(liftWords('Chest Flyes')).toBe('chest fly');
    expect(liftWords('Leg press')).toBe('leg press');
  });

  it('places the names already logged on Sandbag', () => {
    const logged: Record<string, string> = {
      'Cable  Triceps Extension': 'Overhead triceps extension',
      'Cable Bar Pulldown': 'Lat pulldown',
      'Cable Lateral Raises': 'Cable lateral raise',
      'Cable One Arm Lateral Raise': 'Cable lateral raise',
      'Cable Pushdown Triceps': 'Triceps pushdown',
      'Cable Seated Row with V bar': 'V-bar cable row',
      'Calf Raises': 'Standing calf raise',
      'Deck Flyes': 'Pec deck',
      'Dumbbell Cross Body Hammer Curl': 'Cross-body hammer curl',
      'Dumbbell Incline Bench Press': 'Incline dumbbell press',
      'Dumbbell Incline Biceps Curl': 'Incline dumbbell curl',
      'Free Weight Machine Press': 'Plate-loaded chest press',
      'Lat Pulldown': 'Lat pulldown',
      'Leg Press': 'Leg press',
      'Low Seated Row': 'Seated cable row',
      'Neutral-Grip Lat Pulldown': 'Neutral-grip lat pulldown',
      'Preacher Curls': 'Preacher curl',
      'Rear Delt Flyes': 'Rear delt fly',
      'Seated Fly': 'Pec deck',
      'Triceps Overhead Extension': 'Overhead triceps extension',
      'cable chest pulldowns': 'High-to-low cable fly',
      'cable chest pullups': 'Low-to-high cable fly',
      'chest fly': 'Pec deck',
      'chest press': 'Chest press',
      'Converging chest press': 'Converging chest press',
      'decline chest press': 'Decline chest press',
      'incline chest press': 'Incline chest press',
      'Adductor Machine': 'Hip adduction',
      'Back Extensions': 'Back extension',
      'Behind Back Finger Curls': 'Finger curl',
      'Bench press': 'Bench press',
      'Cable Flyes': 'Cable fly',
      'Cable Lateral Raise': 'Cable lateral raise',
      'Cable Press Down': 'Triceps pushdown',
      'Cable curls': 'Cable curl',
      'Cable pull (high)': 'High-to-low cable fly',
      'Cable pull (low)': 'Low-to-high cable fly',
      'Chest Flyes': 'Pec deck',
      'Cross Body Hammer Curls': 'Cross-body hammer curl',
      'Crunches': 'Crunch',
      'Decline bench press': 'Decline bench press',
      'Dumbbell Lateral Raises': 'Lateral raise',
      'Free Weight Machine Shoulder Press': 'Plate-loaded shoulder press',
      'Hip Abduction': 'Hip abduction',
      'Hip Adduction': 'Hip adduction',
      'Incline Dumbbells Bench': 'Incline dumbbell press',
      'Incline bench press': 'Incline bench press',
      'Inclined Free Weight Machine Press': 'Plate-loaded incline press',
      'Leg Extension': 'Leg extension',
      'Leg Extensions': 'Leg extension',
      'Lever Machine Narrow Row': 'Narrow machine row',
      'Lever Seated Abdominal Crunches': 'Ab crunch machine',
      'Lying Leg Curls': 'Lying leg curl',
      'Lying Machine Chest Press': 'Lying chest press',
      'Machine Preacher Curls': 'Machine preacher curl',
      'Machine Seated Wide Row': 'Wide machine row',
      'Machine Shoulder Press': 'Shoulder press machine',
      'Machine Single Hands Row': 'Single-arm machine row',
      'Narrow Grip Cable Row': 'V-bar cable row',
      'Pec fly': 'Pec deck',
      'Rear Delt Fly Cable': 'Cable rear delt fly',
      'Reverse Flyes': 'Rear delt fly',
      'Reverse Wrist Curls': 'Reverse wrist curl',
      'Seated Calf Raises': 'Seated calf raise',
      'Seated Leg Curls': 'Seated leg curl',
      'Seated Machine Row': 'Machine row',
      'T-Bar Row': 'T-bar row',
      'T-bar Row': 'T-bar row',
      'Triceps Machine Press Down': 'Machine triceps pushdown',
      'Triceps Pushdown': 'Triceps pushdown',
      'Triceps Pushdown (Ropes)': 'Rope pushdown',
      'Wrist Curls': 'Wrist curl',
    };
    for (const [name, expected] of Object.entries(logged)) expect(findLift(name)?.name, name).toBe(expected);
  });

  it('leaves near misses and two lifts in one alone', () => {
    expect(findLift('Hummer Curls')).toBeUndefined();
    expect(findLift('coverging chest press')).toBeUndefined();
    expect(findLift('Overhead Cable Triceps Extension + Cable Pull Down')).toBeUndefined();
    expect(findLift('Leg press (wide stance)')?.name).toBe('Leg press');
    expect(findLift('Hack squat')?.name).not.toBe(findLift('Squat')?.name);
  });

  it('finds lifts by the start of each word, own names first', () => {
    const names = (query: string) => searchLifts(query).map((item) => item.name);
    expect(names('calf')).toEqual(['Standing calf raise', 'Seated calf raise']);
    expect(names('lat pull')).toContain('Lat pulldown');
    expect(names('rope')[0]).toBe('Rope pushdown');
    expect(names('ohp')).toEqual(['Overhead press']);
    expect(names('  ')).toEqual([]);
  });

  it('suggests the lift a typo was meant to be, and nothing for a real lift', () => {
    expect(nearestLift('Hummer Curls')?.name).toBe('Hammer curl');
    expect(nearestLift('coverging chest press')?.name).toBe('Converging chest press');
    expect(nearestLift('Lat pulldwon')?.name).toBe('Lat pulldown');
    expect(nearestLift('Hammer curls')).toBeUndefined();
    expect(nearestLift('Tow')).toBeUndefined();
    expect(nearestLift('Zercher carry')).toBeUndefined();
  });

  it('lights the muscles a session worked, against the one worked hardest', () => {
    // Bench: chest, then triceps and shoulders at half. Pushdown: triceps.
    expect(muscleLoad([{ name: 'Bench press', sets: 4 }, { name: 'Triceps pushdown', sets: 2 }])).toEqual({ chest: 1, triceps: 1, shoulders: 0.5 });
    expect(muscleLoad([{ name: 'Lateral raise', sets: null }])).toEqual({ shoulders: 1 });
  });

  it('counts nothing for lifts it doesn’t know', () => {
    expect(muscleLoad([{ name: 'Zercher carry', sets: 3 }])).toEqual({});
    expect(muscleLoad([])).toEqual({});
  });
});

