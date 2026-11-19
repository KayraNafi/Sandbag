/** A big emoji that pops up with the line when a lift is ticked off. */
export type Sticker = { emoji: string; line: string };

/** A jump this big, over the last time, gets the goat. */
const BIG_JUMP = 0.1;

/**
 * Which sticker a finished lift earns, from how hard it was and how its weight compares with last time.
 * Null when it was the first time or there's nothing to say.
 */
export function stickerFor(lift: { rpe: number | null; weight: number | null }, previous: number | null): 'limit' | 'jump' | 'up' | 'down' | 'same' | null {
  if (lift.rpe === 10) return 'limit';
  if (lift.weight === null || previous === null) return null;
  if (lift.weight > previous) return lift.weight / previous - 1 >= BIG_JUMP - 1e-9 ? 'jump' : 'up';
  return lift.weight < previous ? 'down' : 'same';
}

export const STICKERS = { limit: '💀', jump: '🐐', up: '🔥', down: '🥶', same: '🤡' } as const;
