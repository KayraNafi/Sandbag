export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'glutes', 'quads', 'hamstrings', 'calves'] as const;
export type Muscle = (typeof MUSCLES)[number];

/**
 * What a lift is done on. Plate-loaded machines take plates like a bar does;
 * the rest of the machines have a pin in a stack.
 */
export type Kit = 'barbell' | 'dumbbell' | 'machine' | 'plate-loaded' | 'cable' | 'bodyweight';

export interface Lift {
  name: string;
  kit: Kit;
  /** The main muscle first. */
  muscles: Muscle[];
  /** The weight is for one hand or one side. */
  perSide?: boolean;
  /** Held for time rather than lifted for reps. */
  timed?: boolean;
  /** Other words people use for the same lift. Capitals, plurals and hyphens don't need listing. */
  aka?: string[];
}

const lift = (name: string, kit: Kit, muscles: Muscle[], extra: Omit<Lift, 'name' | 'kit' | 'muscles'> = {}): Lift => ({ name, kit, muscles, ...extra });

/**
 * Common gym lifts, and every lift logged on Sandbag so far. Same movement on the same kit is one lift;
 * a different grip or machine is its own, because the weights don't compare.
 */
export const CATALOG: readonly Lift[] = [
  lift('Bench press', 'barbell', ['chest', 'triceps', 'shoulders'], { aka: ['bench', 'flat bench', 'barbell bench press'] }),
  lift('Incline bench press', 'barbell', ['chest', 'shoulders', 'triceps'], { aka: ['incline press', 'incline bench'] }),
  lift('Decline bench press', 'barbell', ['chest', 'triceps'], { aka: ['decline bench'] }),
  lift('Dumbbell bench press', 'dumbbell', ['chest', 'triceps', 'shoulders'], { perSide: true, aka: ['dumbbell press', 'db press', 'db bench press'] }),
  lift('Incline dumbbell press', 'dumbbell', ['chest', 'shoulders', 'triceps'], { perSide: true, aka: ['dumbbell incline bench press', 'incline dumbbells bench', 'incline db press'] }),
  lift('Chest press', 'machine', ['chest', 'triceps'], { aka: ['machine chest press', 'chest press machine'] }),
  lift('Incline chest press', 'machine', ['chest', 'shoulders']),
  lift('Decline chest press', 'machine', ['chest', 'triceps']),
  lift('Converging chest press', 'machine', ['chest', 'triceps']),
  lift('Lying chest press', 'machine', ['chest', 'triceps'], { aka: ['lying machine chest press'] }),
  lift('Plate-loaded chest press', 'plate-loaded', ['chest', 'triceps'], { aka: ['free weight machine press'] }),
  lift('Plate-loaded incline press', 'plate-loaded', ['chest', 'shoulders'], { aka: ['inclined free weight machine press', 'incline free weight machine press'] }),
  lift('Pec deck', 'machine', ['chest'], { aka: ['pec fly', 'chest fly', 'seated fly', 'deck fly', 'machine fly'] }),
  lift('Cable fly', 'cable', ['chest'], { aka: ['cable crossover'] }),
  lift('High-to-low cable fly', 'cable', ['chest'], { aka: ['cable chest pulldown', 'cable pull high'] }),
  lift('Low-to-high cable fly', 'cable', ['chest', 'shoulders'], { aka: ['cable chest pullup', 'cable pull low'] }),
  lift('Push-up', 'bodyweight', ['chest', 'triceps'], { aka: ['pushup'] }),
  lift('Dips', 'bodyweight', ['chest', 'triceps'], { aka: ['chest dip'] }),

  lift('Deadlift', 'barbell', ['back', 'glutes', 'hamstrings'], { aka: ['conventional deadlift', 'barbell deadlift'] }),
  lift('Barbell row', 'barbell', ['back', 'biceps'], { aka: ['bent over row', 'bb row'] }),
  lift('T-bar row', 'plate-loaded', ['back', 'biceps']),
  lift('Dumbbell row', 'dumbbell', ['back', 'biceps'], { perSide: true, aka: ['db row', 'one arm row', 'single arm row'] }),
  lift('Lat pulldown', 'cable', ['back', 'biceps'], { aka: ['pulldown', 'lat pull down', 'cable bar pulldown'] }),
  lift('Neutral-grip lat pulldown', 'cable', ['back', 'biceps']),
  lift('Seated cable row', 'cable', ['back', 'biceps'], { aka: ['cable row', 'seated row', 'low seated row', 'cable seated row with v bar', 'narrow grip cable row'] }),
  lift('Machine row', 'machine', ['back', 'biceps'], { aka: ['seated machine row', 'chest supported row'] }),
  lift('Wide machine row', 'machine', ['back', 'shoulders'], { aka: ['machine seated wide row'] }),
  lift('Narrow machine row', 'plate-loaded', ['back', 'biceps'], { aka: ['lever machine narrow row'] }),
  lift('Single-arm machine row', 'machine', ['back', 'biceps'], { perSide: true, aka: ['machine single hands row', 'machine single hand row'] }),
  lift('Pull-up', 'bodyweight', ['back', 'biceps'], { aka: ['pullup'] }),
  lift('Chin-up', 'bodyweight', ['back', 'biceps'], { aka: ['chinup'] }),
  lift('Back extension', 'bodyweight', ['back', 'glutes', 'hamstrings'], { aka: ['hyperextension'] }),

  lift('Overhead press', 'barbell', ['shoulders', 'triceps'], { aka: ['ohp', 'military press', 'barbell shoulder press'] }),
  lift('Dumbbell shoulder press', 'dumbbell', ['shoulders', 'triceps'], { perSide: true, aka: ['db shoulder press', 'seated dumbbell press'] }),
  lift('Shoulder press machine', 'machine', ['shoulders', 'triceps'], { aka: ['machine shoulder press'] }),
  lift('Plate-loaded shoulder press', 'plate-loaded', ['shoulders', 'triceps'], { aka: ['free weight machine shoulder press'] }),
  lift('Lateral raise', 'dumbbell', ['shoulders'], { perSide: true, aka: ['dumbbell lateral raise', 'side raise', 'lat raise'] }),
  lift('Cable lateral raise', 'cable', ['shoulders'], { perSide: true, aka: ['cable one arm lateral raise'] }),
  lift('Rear delt fly', 'machine', ['shoulders', 'back'], { aka: ['reverse fly', 'reverse pec deck'] }),
  lift('Cable rear delt fly', 'cable', ['shoulders', 'back'], { aka: ['rear delt fly cable'] }),
  lift('Face pull', 'cable', ['shoulders', 'back']),

  lift('Barbell curl', 'barbell', ['biceps', 'forearms'], { aka: ['bb curl', 'ez bar curl'] }),
  lift('Dumbbell curl', 'dumbbell', ['biceps', 'forearms'], { perSide: true, aka: ['db curl', 'bicep curl', 'biceps curl'] }),
  lift('Incline dumbbell curl', 'dumbbell', ['biceps'], { perSide: true, aka: ['dumbbell incline biceps curl', 'incline curl'] }),
  lift('Hammer curl', 'dumbbell', ['biceps', 'forearms'], { perSide: true }),
  lift('Cross-body hammer curl', 'dumbbell', ['biceps', 'forearms'], { perSide: true, aka: ['dumbbell cross body hammer curl'] }),
  lift('Cable curl', 'cable', ['biceps']),
  lift('Preacher curl', 'barbell', ['biceps']),
  lift('Machine preacher curl', 'machine', ['biceps'], { aka: ['preacher curl machine'] }),
  lift('Triceps pushdown', 'cable', ['triceps'], { aka: ['tricep pushdown', 'pushdown', 'rope pushdown', 'cable pushdown triceps', 'cable press down', 'triceps pressdown'] }),
  lift('Machine triceps pushdown', 'machine', ['triceps'], { aka: ['triceps machine press down'] }),
  lift('Overhead triceps extension', 'cable', ['triceps'], { aka: ['triceps overhead extension', 'cable triceps extension', 'overhead cable triceps extension', 'overhead extension'] }),
  lift('Skull crusher', 'barbell', ['triceps'], { aka: ['lying triceps extension'] }),
  lift('Wrist curl', 'dumbbell', ['forearms'], { perSide: true }),
  lift('Reverse wrist curl', 'dumbbell', ['forearms'], { perSide: true }),
  lift('Finger curl', 'barbell', ['forearms'], { aka: ['behind back finger curl'] }),

  lift('Squat', 'barbell', ['quads', 'glutes'], { aka: ['back squat', 'barbell squat'] }),
  lift('Front squat', 'barbell', ['quads', 'glutes']),
  lift('Hack squat', 'plate-loaded', ['quads', 'glutes']),
  lift('Leg press', 'plate-loaded', ['quads', 'glutes']),
  lift('Leg extension', 'machine', ['quads']),
  lift('Goblet squat', 'dumbbell', ['quads', 'glutes']),
  lift('Bulgarian split squat', 'dumbbell', ['quads', 'glutes'], { perSide: true, aka: ['split squat', 'bss'] }),
  lift('Walking lunges', 'dumbbell', ['quads', 'glutes'], { perSide: true, aka: ['lunge', 'walking lunge'] }),
  lift('Romanian deadlift', 'barbell', ['hamstrings', 'glutes', 'back'], { aka: ['rdl', 'romanian dead lift'] }),
  lift('Seated leg curl', 'machine', ['hamstrings']),
  lift('Lying leg curl', 'machine', ['hamstrings']),
  lift('Hip thrust', 'barbell', ['glutes', 'hamstrings'], { aka: ['barbell hip thrust'] }),
  lift('Glute kickback', 'cable', ['glutes'], { perSide: true, aka: ['cable kickback', 'kickback'] }),
  lift('Hip abduction', 'machine', ['glutes'], { aka: ['abductor machine', 'abduction machine'] }),
  lift('Hip adduction', 'machine', ['quads'], { aka: ['adductor machine', 'adduction machine'] }),
  lift('Standing calf raise', 'machine', ['calves'], { aka: ['calf raise'] }),
  lift('Seated calf raise', 'machine', ['calves']),

  lift('Crunch', 'bodyweight', ['abs']),
  lift('Ab crunch machine', 'machine', ['abs'], { aka: ['ab machine', 'lever seated abdominal crunch', 'seated ab crunch'] }),
  lift('Cable crunch', 'cable', ['abs'], { aka: ['kneeling crunch'] }),
  lift('Hanging leg raise', 'bodyweight', ['abs'], { aka: ['leg raise'] }),
  lift('Plank', 'bodyweight', ['abs'], { timed: true }),
];

/** One word without its plural: curls and curl, flyes and fly, crunches and crunch. */
function singular(word: string): string {
  if (word === 'flyes' || word === 'flies') return 'fly';
  if (/(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** A name as it compares: no capitals, plurals, hyphens or punctuation. */
export function liftWords(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(singular).join(' ');
}

const byWords = new Map<string, Lift>();
for (const item of CATALOG) {
  for (const name of [item.name, ...(item.aka ?? [])]) byWords.set(liftWords(name), item);
}

/**
 * The catalog's lift for a name, if it's one it knows. Only exact names: a near miss is a different lift until someone says otherwise.
 * A note in brackets counts when it tells two lifts apart, as in "Cable pull (high)", and is skipped when it doesn't, as in "(ropes)".
 */
export const findLift = (name: string): Lift | undefined =>
  byWords.get(liftWords(name)) ?? byWords.get(liftWords(name.replace(/\(.*?\)/g, ' ')));
