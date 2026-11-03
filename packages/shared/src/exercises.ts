export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'glutes', 'quads', 'hamstrings', 'calves'] as const;
export type Muscle = (typeof MUSCLES)[number];

export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** How far one press of + or − moves the weight, since machines don't load like bars. */
export const EQUIPMENT_STEP: Record<Equipment, number> = { barbell: 2.5, dumbbell: 2, machine: 5, cable: 2.5, bodyweight: 2.5 };

export interface CatalogExercise {
  name: string;
  equipment: Equipment;
  /** The main muscle first. */
  muscles: Muscle[];
  /** Weight is logged per hand or per side. */
  perSide?: boolean;
  aliases?: string[];
}

const lift = (name: string, equipment: Equipment, muscles: Muscle[], extra: Pick<CatalogExercise, 'perSide' | 'aliases'> = {}): CatalogExercise => ({ name, equipment, muscles, ...extra });

export const CATALOG: CatalogExercise[] = [
  lift('Bench press', 'barbell', ['chest', 'triceps', 'shoulders'], { aliases: ['bench', 'flat bench', 'barbell bench press', 'bb bench'] }),
  lift('Incline press', 'barbell', ['chest', 'shoulders', 'triceps'], { aliases: ['incline bench', 'incline bench press', 'incline barbell press'] }),
  lift('Dumbbell press', 'dumbbell', ['chest', 'triceps', 'shoulders'], { perSide: true, aliases: ['db press', 'dumbbell bench press', 'db bench'] }),
  lift('Incline dumbbell press', 'dumbbell', ['chest', 'shoulders', 'triceps'], { perSide: true, aliases: ['incline db press'] }),
  lift('Chest press machine', 'machine', ['chest', 'triceps'], { aliases: ['chest press', 'machine chest press'] }),
  lift('Pec deck', 'machine', ['chest'], { aliases: ['pec fly', 'machine fly', 'chest fly machine'] }),
  lift('Cable fly', 'cable', ['chest'], { aliases: ['cable flyes', 'cable crossover'] }),
  lift('Push-up', 'bodyweight', ['chest', 'triceps'], { aliases: ['pushup', 'pushups', 'push ups', 'push-ups'] }),
  lift('Dips', 'bodyweight', ['chest', 'triceps'], { aliases: ['dip', 'chest dips'] }),

  lift('Deadlift', 'barbell', ['back', 'glutes', 'hamstrings'], { aliases: ['conventional deadlift', 'barbell deadlift'] }),
  lift('Barbell row', 'barbell', ['back', 'biceps'], { aliases: ['bent over row', 'bent-over row', 'bb row'] }),
  lift('Dumbbell row', 'dumbbell', ['back', 'biceps'], { perSide: true, aliases: ['db row', 'one arm row', 'single arm row'] }),
  lift('Lat pulldown', 'cable', ['back', 'biceps'], { aliases: ['pulldown', 'lat pull down', 'lat pull-down'] }),
  lift('Seated cable row', 'cable', ['back', 'biceps'], { aliases: ['cable row', 'seated row'] }),
  lift('Machine row', 'machine', ['back', 'biceps'], { aliases: ['chest supported row', 'hammer strength row'] }),
  lift('Pull-up', 'bodyweight', ['back', 'biceps'], { aliases: ['pullup', 'pullups', 'pull ups', 'pull-ups'] }),
  lift('Chin-up', 'bodyweight', ['back', 'biceps'], { aliases: ['chinup', 'chinups', 'chin ups', 'chin-ups'] }),
  lift('Face pull', 'cable', ['shoulders', 'back'], { aliases: ['face pulls'] }),

  lift('Overhead press', 'barbell', ['shoulders', 'triceps'], { aliases: ['ohp', 'military press', 'barbell shoulder press'] }),
  lift('Dumbbell shoulder press', 'dumbbell', ['shoulders', 'triceps'], { perSide: true, aliases: ['db shoulder press', 'seated dumbbell press'] }),
  lift('Shoulder press machine', 'machine', ['shoulders', 'triceps'], { aliases: ['machine shoulder press'] }),
  lift('Lateral raises', 'dumbbell', ['shoulders'], { perSide: true, aliases: ['lateral raise', 'side raise', 'side raises', 'lat raises'] }),
  lift('Cable lateral raise', 'cable', ['shoulders'], { perSide: true }),
  lift('Rear delt fly', 'machine', ['shoulders', 'back'], { aliases: ['reverse pec deck', 'reverse fly'] }),

  lift('Barbell curl', 'barbell', ['biceps', 'forearms'], { aliases: ['bb curl', 'ez bar curl'] }),
  lift('Dumbbell curl', 'dumbbell', ['biceps', 'forearms'], { perSide: true, aliases: ['db curl', 'bicep curl', 'biceps curl'] }),
  lift('Hammer curl', 'dumbbell', ['biceps', 'forearms'], { perSide: true, aliases: ['hammer curls'] }),
  lift('Cable curls', 'cable', ['biceps'], { aliases: ['cable curl'] }),
  lift('Preacher curl machine', 'machine', ['biceps'], { aliases: ['preacher curl', 'machine curl'] }),
  lift('Triceps pushdown', 'cable', ['triceps'], { aliases: ['tricep pushdown', 'pushdown', 'rope pushdown', 'triceps pressdown'] }),
  lift('Overhead triceps extension', 'cable', ['triceps'], { aliases: ['overhead extension', 'overhead tricep extension'] }),
  lift('Skull crusher', 'barbell', ['triceps'], { aliases: ['skull crushers', 'lying triceps extension'] }),
  lift('Wrist curl', 'dumbbell', ['forearms'], { perSide: true, aliases: ['wrist curls'] }),

  lift('Squat', 'barbell', ['quads', 'glutes'], { aliases: ['back squat', 'barbell squat'] }),
  lift('Front squat', 'barbell', ['quads', 'glutes'], { aliases: ['front squats'] }),
  lift('Hack squat', 'machine', ['quads', 'glutes'], { aliases: ['hack squats', 'machine hack squat'] }),
  lift('Leg press', 'machine', ['quads', 'glutes'], { aliases: ['leg presses'] }),
  lift('Leg extension', 'machine', ['quads'], { aliases: ['leg extensions'] }),
  lift('Goblet squat', 'dumbbell', ['quads', 'glutes'], { aliases: ['goblet squats'] }),
  lift('Bulgarian split squat', 'dumbbell', ['quads', 'glutes'], { perSide: true, aliases: ['split squat', 'split squats', 'bss'] }),
  lift('Walking lunges', 'dumbbell', ['quads', 'glutes'], { perSide: true, aliases: ['lunges', 'lunge', 'walking lunge'] }),

  lift('Romanian deadlift', 'barbell', ['hamstrings', 'glutes', 'back'], { aliases: ['rdl', 'romanian dead lift'] }),
  lift('Leg curl', 'machine', ['hamstrings'], { aliases: ['leg curls', 'hamstring curl', 'seated leg curl', 'lying leg curl'] }),
  lift('Hip thrust', 'barbell', ['glutes', 'hamstrings'], { aliases: ['hip thrusts', 'barbell hip thrust'] }),
  lift('Glute kickback', 'cable', ['glutes'], { perSide: true, aliases: ['cable kickback', 'kickbacks'] }),

  lift('Standing calf raise', 'machine', ['calves'], { aliases: ['calf raise', 'calf raises', 'standing calf raises'] }),
  lift('Seated calf raise', 'machine', ['calves'], { aliases: ['seated calf raises'] }),

  lift('Cable crunch', 'cable', ['abs'], { aliases: ['cable crunches', 'kneeling crunch'] }),
  lift('Hanging leg raise', 'bodyweight', ['abs'], { aliases: ['hanging leg raises', 'leg raises', 'leg raise'] }),
  lift('Plank', 'bodyweight', ['abs'], { aliases: ['planks'] }),
  lift('Ab machine', 'machine', ['abs'], { aliases: ['ab crunch machine'] }),
];

const plain = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const byKey = new Map<string, CatalogExercise>();
for (const exercise of CATALOG) {
  byKey.set(plain(exercise.name), exercise);
  for (const alias of exercise.aliases ?? []) byKey.set(alias, exercise);
}

/** True when two strings differ by one typed character: one wrong, one extra, or one missing. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Long enough that one wrong letter is a typo rather than another word, like "row" and "bow".
const MIN_TYPO_LENGTH = 7;
const keys = new Map<string, string>();

/**
 * One lift's identity, however it was typed. Scores, calls and history all key on
 * this, so "Bench pres" or "Bench press (barbell)" can't reset a baseline or dodge a
 * call. Close to two known lifts means it's ambiguous, so it stays what was typed.
 */
export function exerciseKey(name: string): string {
  const cached = keys.get(name);
  if (cached) return cached;
  const typed = plain(name);
  const bare = plain(typed.replace(/\(.*?\)/g, ' ')) || typed;
  let match = byKey.get(typed) ?? byKey.get(bare);
  if (!match && bare.length >= MIN_TYPO_LENGTH) {
    const near = new Set([...byKey].filter(([known]) => oneEditApart(bare, known)).map(([, exercise]) => exercise));
    if (near.size === 1) [match] = near;
  }
  const key = match ? plain(match.name) : bare;
  keys.set(name, key);
  return key;
}

export const catalogEntry = (name: string): CatalogExercise | undefined => byKey.get(exerciseKey(name));

export function exercisesFor(muscle: Muscle | null, equipment: Equipment | null, query = ''): CatalogExercise[] {
  const typed = plain(query);
  return CATALOG.filter((exercise) => (!muscle || exercise.muscles.includes(muscle))
    && (!equipment || exercise.equipment === equipment)
    && (!typed || plain(exercise.name).includes(typed) || exercise.aliases?.some((alias) => alias.includes(typed))));
}

export interface StarterWorkout {
  name: string;
  blurb: string;
  exercises: string[];
}

/** So nobody's first screen is a blank box asking them to invent a workout. */
export const STARTER_WORKOUTS: StarterWorkout[] = [
  { name: 'Full body', blurb: 'Everything, twice or three times a week', exercises: ['Squat', 'Bench press', 'Lat pulldown', 'Dumbbell shoulder press', 'Leg curl'] },
  { name: 'Upper', blurb: 'Chest, back, shoulders and arms', exercises: ['Bench press', 'Lat pulldown', 'Dumbbell shoulder press', 'Seated cable row', 'Cable curls', 'Triceps pushdown'] },
  { name: 'Lower', blurb: 'Legs and glutes', exercises: ['Squat', 'Romanian deadlift', 'Leg press', 'Leg curl', 'Standing calf raise'] },
  { name: 'Push', blurb: 'Chest, shoulders and triceps', exercises: ['Bench press', 'Overhead press', 'Incline dumbbell press', 'Lateral raises', 'Triceps pushdown'] },
  { name: 'Pull', blurb: 'Back and biceps', exercises: ['Deadlift', 'Lat pulldown', 'Barbell row', 'Face pull', 'Dumbbell curl'] },
];
