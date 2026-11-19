import { describe, expect, it } from 'vitest';
import { stickerFor } from './stickers';

describe('stickerFor', () => {
  it('calls an RPE 10 the limit, whatever the weight did', () => {
    expect(stickerFor({ rpe: 10, weight: 50 }, 60)).toBe('limit');
    expect(stickerFor({ rpe: 10, weight: null }, null)).toBe('limit');
  });

  it('says nothing the first time, or without a weight', () => {
    expect(stickerFor({ rpe: 8, weight: 50 }, null)).toBeNull();
    expect(stickerFor({ rpe: null, weight: null }, 50)).toBeNull();
  });

  it('tells a small gain from a big jump, and a drop from the same again', () => {
    expect(stickerFor({ rpe: null, weight: 52.5 }, 50)).toBe('up');
    expect(stickerFor({ rpe: null, weight: 55 }, 50)).toBe('jump');
    expect(stickerFor({ rpe: null, weight: 47.5 }, 50)).toBe('down');
    expect(stickerFor({ rpe: null, weight: 50 }, 50)).toBe('same');
  });
});
