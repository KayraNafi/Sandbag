import { describe, expect, it } from 'vitest';
import { beatABest, weekStreak } from './scoring';
import { nextInviteGoal, periodStats } from './scoring';

const lift = (name: string, weight: number | null) => ({ name, kind: 'strength' as const, weight });
const TODAY = '2026-10-30';

describe('periodStats', () => {
  const session = (date: string, weights: [string, number][]) => ({ date, entries: weights.map(([name, weight]) => lift(name, weight)) });

  it('limits how far one lift moves the average, up or down', () => {
    const before = session('2026-10-10', [['Squat', 60], ['Bench', 100], ['Row', 50], ['Curl', 20]]);
    const fake = session('2026-10-28', [['Squat', 2000], ['Bench', 100], ['Row', 50], ['Curl', 20]]);
    expect(periodStats([before, fake], 'week', 3, TODAY).progress).toBe(6.3);
    const slip = session('2026-10-28', [['Squat', 6], ['Bench', 100], ['Row', 50], ['Curl', 20]]);
    expect(periodStats([before, slip], 'week', 3, TODAY).progress).toBe(-6.2);
  });

  it('counts a real jump in full up to the limit', () => {
    const stats = periodStats([session('2026-10-10', [['Curl', 20]]), session('2026-10-28', [['Curl', 25]])], 'week', 3, TODAY);
    expect(stats.progress).toBe(25);
  });

  it('measures progress against the last number before the period', () => {
    const stats = periodStats(
      [
        { date: '2026-10-10', entries: [lift('Lat pulldown', 80)] },
        { date: '2026-10-28', entries: [lift('Lat pulldown', 88)] },
      ],
      'week', 3, TODAY,
    );
    expect(stats.progress).toBe(10);
    expect(stats.workouts).toBe(1);
  });

  it('treats exercise names case-insensitively', () => {
    const stats = periodStats(
      [
        { date: '2026-10-29', entries: [lift('LAT  pulldown', 80)] },
        { date: '2026-10-30', entries: [lift('lat pulldown', 84)] },
      ],
      'week', 3, TODAY,
    );
    expect(stats.progress).toBe(5);
  });

  it('averages exercises so one big jump cannot carry the score', () => {
    const stats = periodStats(
      [
        { date: '2026-10-01', entries: [lift('A', 100), lift('B', 100)] },
        { date: '2026-10-29', entries: [lift('A', 120), lift('B', 100)] },
      ],
      'week', 3, TODAY,
    );
    expect(stats.progress).toBe(10);
  });

  it('caps consistency and floors negative progress points', () => {
    const stats = periodStats(
      [
        { date: '2026-10-01', entries: [lift('A', 100)] },
        { date: '2026-10-28', entries: [lift('A', 50)] },
        { date: '2026-10-29', entries: [lift('A', 50)] },
        { date: '2026-10-30', entries: [lift('A', 50)] },
      ],
      'week', 1, TODAY,
    );
    expect(stats.progress).toBe(-25);
    expect(stats.consistency).toBe(100);
    expect(stats.score).toBe(50);
  });

  it('ignores timed work, empty weights and future dates', () => {
    const stats = periodStats(
      [
        { date: '2026-10-29', entries: [{ name: 'Rope', kind: 'time', weight: null }, lift('A', null)] },
        { date: '2026-11-05', entries: [lift('A', 100)] },
      ],
      'week', 3, TODAY,
    );
    expect(stats.progress).toBe(0);
    expect(stats.workouts).toBe(1);
  });

  it('handles someone with no workouts', () => {
    expect(periodStats([], 'month', 3, TODAY)).toEqual({ progress: 0, workouts: 0, consistency: 0, score: 0 });
  });
});

describe('nextInviteGoal', () => {
  it('moves through the goals and ends', () => {
    expect(nextInviteGoal(0)?.name).toBe('Recruiter');
    expect(nextInviteGoal(3)?.name).toBe('Crew boss');
    expect(nextInviteGoal(25)).toBeNull();
  });
});

describe('weekStreak', () => {
  // 2026-10-26 is a Monday.
  const week = (monday: string, count: number) => Array.from({ length: count }, (_, day) => {
    const date = new Date(`${monday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day);
    return date.toISOString().slice(0, 10);
  });

  it('counts finished weeks, and an unfinished week doesn’t break them', () => {
    const dates = [...week('2026-10-12', 3), ...week('2026-10-19', 3), ...week('2026-10-26', 1)];
    expect(weekStreak(dates, 3, '2026-10-30')).toEqual({ current: 2, best: 2 });
  });

  it('adds this week as soon as the target is met', () => {
    const dates = [...week('2026-10-19', 3), ...week('2026-10-26', 3)];
    expect(weekStreak(dates, 3, '2026-10-28').current).toBe(2);
  });

  it('breaks on a missed week, and remembers the best run', () => {
    const dates = [...week('2026-09-28', 3), ...week('2026-10-05', 3), ...week('2026-10-12', 3), ...week('2026-10-26', 3)];
    expect(weekStreak(dates, 3, '2026-10-30')).toEqual({ current: 1, best: 3 });
  });

  it('ends a streak once a whole week goes by', () => {
    expect(weekStreak(week('2026-10-05', 3), 3, '2026-10-30').current).toBe(0);
  });

  it('copes with nothing', () => {
    expect(weekStreak([], 3, '2026-10-30')).toEqual({ current: 0, best: 0 });
  });
});

describe('beatABest', () => {
  const workout = (date: string, weight: number) => ({ date, entries: [{ name: 'Curl', kind: 'strength' as const, weight }] });

  it('needs an earlier number to beat', () => {
    expect(beatABest([workout('2026-10-01', 50)])).toBe(false);
    expect(beatABest([workout('2026-10-02', 40), workout('2026-10-01', 50)])).toBe(false);
    expect(beatABest([workout('2026-10-01', 50), workout('2026-10-02', 52.5)])).toBe(true);
  });
});
