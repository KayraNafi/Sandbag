import { CATALOG, exerciseKey, findLift, liftWords, nearestLift, searchLifts, type Kit, type Lift, type Muscle } from '@sandbag/shared';

/** A lift the picker offers. The name is what gets logged; the lift is the catalog's, when it knows it. */
export interface LiftChoice {
  name: string;
  lift: Lift | undefined;
}

export interface LiftChoices {
  choices: LiftChoice[];
  /** A catalog lift the typed name looks like a typo of. */
  meant: LiftChoice | undefined;
  /** Whether the typed name is offered as it is, so it can still be added as someone's own lift. */
  typedIsOffered: boolean;
}

/**
 * What the picker shows for a search, a muscle and a kit. Lifts you've logged come first and keep your name for them,
 * so picking one carries on its history instead of starting a second one under the catalog's name.
 */
export function liftChoices({ query, muscle, kit, known, exclude }: {
  query: string;
  muscle: Muscle | null;
  kit: Kit | null;
  /** Lift names you've logged, most recent first. */
  known: string[];
  /** Names already in the workout. */
  exclude: string[];
}): LiftChoices {
  const yours = new Map<Lift, string>();
  for (const name of known) {
    const lift = findLift(name);
    if (lift && !yours.has(lift)) yours.set(lift, name);
  }
  const custom = known.filter((name) => !findLift(name));
  const asChoice = (lift: Lift): LiftChoice => ({ name: yours.get(lift) ?? lift.name, lift });
  const fits = (lift: Lift) => (!muscle || lift.muscles.includes(muscle)) && (!kit || lift.kit === kit);

  const typed = liftWords(query);
  const lifts = typed ? searchLifts(query).filter(fits) : CATALOG.filter(fits);
  // A muscle's own lifts before the ones that only help it.
  const ordered = muscle && !typed ? [...lifts].sort((a, b) => Number(a.muscles[0] !== muscle) - Number(b.muscles[0] !== muscle)) : lifts;
  const yoursFirst = [...ordered].sort((a, b) => Number(!yours.has(a)) - Number(!yours.has(b)));
  // Your own lifts have no muscles or kit, so they only turn up for a search.
  const customs = typed && !muscle && !kit
    ? custom.filter((name) => liftWords(name).includes(typed)).map((name): LiftChoice => ({ name, lift: undefined }))
    : [];

  const taken = new Set(exclude.map(exerciseKey));
  const choices = [...customs, ...yoursFirst.map(asChoice)].filter((choice) => !taken.has(exerciseKey(choice.name)));
  const typedIsOffered = choices.some((choice) => liftWords(choice.name) === typed);
  const typo = typed && !known.some((name) => liftWords(name) === typed) ? nearestLift(query) : undefined;
  const meant = typo && !taken.has(exerciseKey(asChoice(typo).name)) ? asChoice(typo) : undefined;
  return { choices, meant, typedIsOffered };
}

/**
 * Per-lift settings, with each one also under the catalog's name for its lift. Logged names were moved to
 * the catalog's spelling on 2026-11-07, and a setting kept under the old name would stop being found.
 * Anything already under the new name wins.
 */
export function underCatalogNames<T>(byLift: Record<string, T>): Record<string, T> {
  const moved: Record<string, T> = {};
  for (const [key, value] of Object.entries(byLift)) {
    const lift = findLift(key);
    if (lift) moved[exerciseKey(lift.name)] = value;
  }
  return { ...moved, ...byLift };
}

