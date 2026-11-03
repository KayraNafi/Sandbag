import { describe, expect, it } from 'vitest';
import { backfillDates, changeWords, clock, dayLabel, fitSize, isOverMax, nudge, ordinal, parseNumber, setsReps, summary } from './format';

describe('fitSize', () => {
  it('keeps the size until the text no longer fits, then shrinks to fit', () => {
    expect(fitSize(72, 5, 358)).toBe(72);
    const small = fitSize(72, 13, 288);
    expect(small).toBeLessThan(72);
    expect(small * 13 * 0.56).toBeLessThanOrEqual(288);
    expect(fitSize(72, 0, 100)).toBeLessThanOrEqual(72);
  });
});

describe('ordinal', () => {
  it('reads the way people say it', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd', '111th']);
  });
});

describe('nudge', () => {
  it('moves one step from a number already on the grid', () => {
    expect(nudge(60, 5)).toBe(65);
    expect(nudge(60, -5)).toBe(55);
    expect(nudge(57.5, 2.5)).toBe(60);
  });

  it('lands on the grid from a number that isn’t', () => {
    expect(nudge(57.5, 5)).toBe(60);
    expect(nudge(57.5, -5)).toBe(55);
    expect(nudge(63, 10)).toBe(70);
    expect(nudge(63, -10)).toBe(60);
  });

  it('stops at zero', () => {
    expect(nudge(0, -5)).toBe(0);
    expect(nudge(2, -5)).toBe(0);
    expect(nudge(0, 2.5)).toBe(2.5);
  });
});

describe('typed numbers', () => {
  it('won’t read hex or scientific notation as a weight', () => {
    for (const text of ['0x10', '1e5', '-5', '1,000.5', '.', '5 kg']) expect(parseNumber(text, 2000)).toBeNull();
    expect(parseNumber('5.', 2000)).toBe(5);
    expect(parseNumber('.5', 2000)).toBe(0.5);
  });

  it('reads decimals with either separator, and nothing from blanks', () => {
    expect(parseNumber('12,5', 2000)).toBe(12.5);
    expect(parseNumber('12.5', 2000)).toBe(12.5);
    expect(parseNumber('  ', 2000)).toBeNull();
    expect(parseNumber('abc', 2000)).toBeNull();
  });

  it('notices anything over the limit, however long, but not the limit itself', () => {
    expect(isOverMax('2000', 2000)).toBe(false);
    expect(isOverMax('2000,5', 2000)).toBe(true);
    expect(isOverMax('9999999', 2000)).toBe(true);
    expect(isOverMax('9'.repeat(400), 2000)).toBe(true);
    expect(isOverMax('', 2000)).toBe(false);
    expect(isOverMax('abc', 2000)).toBe(false);
  });
});

describe('setsReps', () => {
  it('lists each set when they differ', () => {
    expect(setsReps({ sets: 3, reps: 8, setReps: [8, 8, 6] })).toBe('8, 8, 6');
    expect(setsReps({ sets: 3, reps: 8, setReps: [8, null, 6] })).toBe('8, –, 6');
  });

  it('falls back to sets × reps without a list, or when the list no longer fits', () => {
    expect(setsReps({ sets: 3, reps: 8 })).toBe('3 × 8');
    expect(setsReps({ sets: 4, reps: 8, setReps: [8, 8, 6] })).toBe('4 × 8');
  });
});

describe('backfillDates', () => {
  it('offers today and the seven days before it, newest first', () => {
    expect(backfillDates('2026-11-02')).toEqual([
      '2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27', '2026-10-26',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(backfillDates('2026-01-03').at(-1)).toBe('2025-12-27');
  });
});

describe('dayLabel', () => {
  it('names the recent days and dates the rest', () => {
    expect(dayLabel('2026-11-02', '2026-11-02')).toBe('Today');
    expect(dayLabel('2026-11-01', '2026-11-02')).toBe('Yesterday');
    expect(dayLabel('2026-10-26', '2026-11-02')).toContain('26 Oct');
  });
});

describe('summary', () => {
  const entry = { id: 'x', name: 'Squat', kind: 'strength' as const, sets: 3, reps: 8, weight: 80, perSide: false, rpe: null, minutes: null, note: '' };

  it('shows one weight when they match, and each when they differ', () => {
    expect(summary(entry)).toBe('80 kg · 3 × 8');
    expect(summary({ ...entry, setWeights: [60, 70, 80], setReps: [10, 8, 6] })).toBe('60, 70, 80 kg · 10, 8, 6');
  });
});

describe('clock', () => {
  it('reads minutes and seconds', () => {
    expect(clock(92)).toBe('1:32');
    expect(clock(5)).toBe('0:05');
  });
});

describe('changeWords', () => {
  it('reads as a percentage for ordinary changes', () => {
    expect(changeWords(110, 100)).toBe('+10%');
    expect(changeWords(90, 100)).toBe('−10%');
    expect(changeWords(100, 100)).toBe('+0%');
  });

  it('switches to a multiple once a percentage stops meaning anything', () => {
    expect(changeWords(2000, 100)).toBe('×20');
    expect(changeWords(300000, 10)).toBe('×30,000');
  });

  it('has nothing to compare to zero', () => {
    expect(changeWords(100, 0)).toBeNull();
  });
});
