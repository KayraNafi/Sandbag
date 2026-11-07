/** Anything in a workout's list that can be done back to back with the one after it. */
export interface Linkable {
  /** Done back to back with the next lift, resting only after both. Absent on everything logged before supersets. */
  supersetWithNext?: boolean | undefined;
}

/**
 * The workout as it's done: each run of lifts marked to go with the next one, plus the lift that closes it.
 * A lift on its own is a group of one, and a mark on the very last lift links to nothing.
 */
export function supersetGroups<T extends Linkable>(items: readonly T[]): T[][] {
  const groups: T[][] = [];
  let open = false;
  for (const item of items) {
    if (open) groups.at(-1)!.push(item);
    else groups.push([item]);
    open = Boolean(item.supersetWithNext);
  }
  return groups;
}

/**
 * Only the lifts to keep, still paired the way they were. A lift left on its own isn't marked,
 * so a mark never ends up pointing at a lift it was never done with.
 */
export function keepSupersets<T extends Linkable>(items: readonly T[], keep: (item: T) => boolean): T[] {
  return supersetGroups(items).flatMap((group) => {
    const kept = group.filter(keep);
    return kept.map((item, place) => {
      const linked = place < kept.length - 1;
      if (Boolean(item.supersetWithNext) === linked) return item;
      const { supersetWithNext: _mark, ...rest } = item;
      return (linked ? { ...rest, supersetWithNext: true } : rest) as T;
    });
  });
}
