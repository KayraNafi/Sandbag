import { describe, expect, it } from 'vitest';
import { loadOf, plateWords, platesFor } from './plates';

describe('platesFor', () => {
  it('loads each side, leaving out the bar', () => {
    expect(platesFor(100)).toEqual([25, 15]);
  });

  it('is an empty bar at or below the weight of the bar', () => {
    expect(platesFor(20)).toEqual([]);
    expect(platesFor(15)).toEqual([]);
  });

  it('uses the small plates for the odd numbers', () => {
    expect(platesFor(62.5)).toEqual([20, 1.25]);
  });

  it('skips the bar when there isn’t one', () => {
    expect(platesFor(50, 0)).toEqual([25]);
  });
});

describe('plateWords', () => {
  it('says what goes on each side', () => {
    expect(plateWords(60)).toBe('EACH SIDE 20');
    expect(plateWords(105)).toBe('EACH SIDE 25 + 15 + 2.5');
    expect(plateWords(120)).toBe('EACH SIDE 2 × 25');
  });

  it('copes with an empty bar, less than a bar, and numbers plates can’t make', () => {
    expect(plateWords(20)).toBe('JUST THE BAR');
    expect(plateWords(15)).toBeNull();
    expect(plateWords(21)).toBeNull();
    expect(plateWords(23.3)).toBe('ABOUT EACH SIDE 1.25');
  });
});

describe('loadOf', () => {
  const total = { perSide: false };

  it('loads a bar around the bar, unless the number leaves the bar out or is for one side', () => {
    expect(loadOf(100, 'barbell', total)).toEqual({ kind: 'plates', plates: [25, 15], words: 'EACH SIDE 25 + 15', handle: 'bar' });
    expect(loadOf(80, 'barbell', { perSide: false, includesEquipment: false })).toMatchObject({ plates: [25, 15] });
    expect(loadOf(40, 'barbell', { perSide: true })).toMatchObject({ plates: [25, 15] });
  });

  it('puts plates on a machine’s sled without a bar, and splits a dumbbell between its ends', () => {
    expect(loadOf(100, 'plate-loaded', total)).toMatchObject({ plates: [25, 25], words: 'EACH SIDE 2 × 25' });
    expect(loadOf(20, 'dumbbell', { perSide: true })).toEqual({ kind: 'plates', plates: [10], words: null, handle: 'dumbbell' });
  });

  it('shows a pin stack for machines and cables, and nothing without a weight', () => {
    expect(loadOf(45, 'cable', total)).toEqual({ kind: 'stack', weight: 45 });
    expect(loadOf(45, 'bodyweight', total)).toBeNull();
    expect(loadOf(null, 'barbell', total)).toBeNull();
  });
});
