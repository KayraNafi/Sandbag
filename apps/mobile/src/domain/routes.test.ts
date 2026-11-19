import { describe, expect, it } from 'vitest';
import { hrefFor } from './routes';

describe('hrefFor', () => {
  it('opens a month’s wrapped, and only a well-formed one', () => {
    expect(hrefFor('wrapped/2026-11')).toBe('/card?month=2026-11');
    expect(hrefFor('wrapped/soon')).toBeNull();
  });

  it('still knows the other places a notification can lead', () => {
    expect(hrefFor('train')).toBe('/');
    expect(hrefFor('post/123e4567-e89b-12d3-a456-426614174000')).toBe('/post/123e4567-e89b-12d3-a456-426614174000');
    expect(hrefFor(null)).toBeNull();
  });
});
