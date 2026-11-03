import { describe, expect, it } from 'vitest';
import { returnPath } from './routes';

describe('returnPath', () => {
  it('goes back to real pages', () => {
    expect(returnPath('/post/3f2c1b1a-1111-4222-8333-444455556666')).toBe('/post/3f2c1b1a-1111-4222-8333-444455556666');
    expect(returnPath('/exercise/squat')).toBe('/exercise/squat');
    expect(returnPath('/settings')).toBe('/settings');
  });

  it('ignores anywhere else, and anything that could leave the app', () => {
    for (const path of ['/', '', null, undefined, '//evil.example', 'https://evil.example/post/1', '/post/nope', '/settings/../../evil', '/workout/active', '/exercise/a/b', '/exercise/\\\\evil']) {
      expect(returnPath(path)).toBeNull();
    }
  });
});
