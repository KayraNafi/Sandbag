import { describe, expect, it } from 'vitest';
import { backfillDates, dayLabel, isOverMax, parseNumber, setsReps } from './format';

describe('typed numbers', () => {
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
