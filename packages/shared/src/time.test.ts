import { describe, expect, it } from 'vitest';
import { canonicalZone, dateIn, dayOfWeek, mondayOf, onTime } from './time';

describe('onTime', () => {
  it('allows 2 days after the date', () => {
    expect(onTime('2026-12-15', '2026-12-17')).toBe(true);
    expect(onTime('2026-12-15', '2026-12-18')).toBe(false);
  });

  it('leaves alone whatever was logged before the rule began, and anything the server never dated', () => {
    expect(onTime('2026-11-03', '2026-11-10')).toBe(true);
    expect(onTime('2026-11-03', '2026-11-15')).toBe(true);
    expect(onTime('2026-11-03', '2026-11-16')).toBe(false);
    expect(onTime('2026-11-03')).toBe(true);
  });
});

describe('dateIn', () => {
  const lateSundayInNewYork = new Date('2026-11-02T01:00:00Z');

  it('gives the date where someone is', () => {
    expect(dateIn('America/New_York', lateSundayInNewYork)).toBe('2026-11-01');
    expect(dateIn('Asia/Dubai', lateSundayInNewYork)).toBe('2026-11-02');
  });

  it('falls back to UTC with no zone, or a zone nobody knows', () => {
    expect(dateIn(null, lateSundayInNewYork)).toBe('2026-11-02');
    expect(dateIn('Mars/Olympus_Mons', lateSundayInNewYork)).toBe('2026-11-02');
  });
});

describe('canonicalZone', () => {
  it('accepts real zones and refuses the rest', () => {
    expect(canonicalZone('Europe/Istanbul')).toBe('Europe/Istanbul');
    expect(canonicalZone('Mars/Olympus_Mons')).toBeNull();
  });
});

describe('weeks', () => {
  it('run Monday to Sunday', () => {
    expect(dayOfWeek('2026-11-02')).toBe(1);
    expect(dayOfWeek('2026-11-08')).toBe(7);
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
  });
});
