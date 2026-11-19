import { z } from 'zod';
import type { PublicUser, ReactionGroup } from './schemas';

/** What you can answer a post or a reply with. Respect is the salute, the one the app started with. */
export const REACTIONS = ['🫡', '💪', '🔥', '👏', '😂', '💀', '🍑', '🥒', '🐐', '🤡', '🏆', '🥵', '🥶', '🤤', '💦'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const reactSchema = z.object({ emoji: z.enum(REACTIONS) });

/**
 * The groups as they'd stand if you reacted with this, or took your reaction back with null. One reaction each,
 * so it moves from whatever you had before. For showing the tap at once, before the server has answered.
 */
export function withMyReaction(groups: readonly ReactionGroup[], me: PublicUser, emoji: Reaction | null): ReactionGroup[] {
  return sortReactions(replaced(groups, me, emoji));
}

function replaced(groups: readonly ReactionGroup[], me: PublicUser, emoji: Reaction | null): ReactionGroup[] {
  const without = groups.map((group) => (
    group.byMe ? { ...group, byMe: false, users: group.users.filter((user) => user.id !== me.id) } : group
  )).filter((group) => group.users.length > 0);
  if (!emoji) return without;
  const existing = without.find((group) => group.emoji === emoji);
  if (existing) return without.map((group) => (group === existing ? { ...group, byMe: true, users: [...group.users, me] } : group));
  return [...without, { emoji, byMe: true, users: [me] }];
}

/** Groups in the order of the picker, so a row of reactions doesn't reshuffle as people tap. */
export const sortReactions = (groups: readonly ReactionGroup[]): ReactionGroup[] =>
  [...groups].sort((a, b) => REACTIONS.indexOf(a.emoji) - REACTIONS.indexOf(b.emoji));
