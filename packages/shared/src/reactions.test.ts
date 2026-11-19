import { describe, expect, it } from 'vitest';
import { withMyReaction } from './reactions';
import type { PublicUser, ReactionGroup } from './schemas';

const user = (id: string): PublicUser => ({ id, username: id, displayName: id, avatar: 'bolt' } as unknown as PublicUser);
const me = user('me');
const group = (emoji: ReactionGroup['emoji'], ...ids: string[]): ReactionGroup => ({ emoji, byMe: ids.includes('me'), users: ids.map(user) });

describe('withMyReaction', () => {
  it('adds yours to a group that exists, or starts one', () => {
    expect(withMyReaction([group('🔥', 'a')], me, '🔥')).toEqual([group('🔥', 'a', 'me')]);
    expect(withMyReaction([group('🔥', 'a')], me, '💪').map((g) => g.emoji)).toEqual(['💪', '🔥']);
  });

  it('moves yours rather than adding a second', () => {
    const next = withMyReaction([group('🔥', 'me'), group('💪', 'b')], me, '💪');
    expect(next).toEqual([group('💪', 'b', 'me')]);
    expect(withMyReaction([group('🔥', 'a', 'me')], me, '💪')).toEqual([group('💪', 'me'), group('🔥', 'a')]);
  });

  it('drops a group once nobody is left in it, and takes yours back with null', () => {
    expect(withMyReaction([group('🔥', 'me')], me, null)).toEqual([]);
    expect(withMyReaction([group('🔥', 'a', 'me')], me, null)).toEqual([group('🔥', 'a')]);
  });
});
