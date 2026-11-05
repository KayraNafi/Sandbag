import { describe, expect, it } from 'vitest';
import { defaultAvatar } from './schemas';

describe('defaultAvatar', () => {
  it('keeps the face of everyone who never picked one', () => {
    // Pinned so adding a character can't swap these.
    expect(['a', 'kayra', '7d1c0f2e-1b2a-4c3d-9e8f-001122334455'].map(defaultAvatar)).toMatchInlineSnapshot(`
      [
        "frog",
        "dumbbell",
        "beard",
      ]
    `);
  });
});
