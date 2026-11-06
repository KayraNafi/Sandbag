import { describe, expect, it } from 'vitest';
import { believable, distancePoints, newPbOf, pacePoints, pbDistanceOf, personalBest, runHeadline, runningStats, runTime, weekRunning, type ScoringRun } from './running';
import { allTimeScore, weekScore } from './scoring';

// A Friday. Its week began on Monday 2026-10-26.
const TODAY = '2026-10-30';

const run = (date: string, distanceKm: number, minutes: number, activity: ScoringRun['activity'] = 'run'): ScoringRun => ({
  date, activity, distanceKm, seconds: Math.round(minutes * 60),
});
const walk = (date: string, distanceKm: number, minutes: number) => run(date, distanceKm, minutes, 'walk');
const hms = (hours: number, minutes: number) => hours * 60 + minutes;

describe('believable', () => {
  it('believes anything slower than the world record, at any distance', () => {
    expect(believable(run(TODAY, 5, 12.5))).toBe(true);
    expect(believable(run(TODAY, 5, 12))).toBe(false);
    // The marathon record is 2:00:35.
    expect(believable(run(TODAY, 42.195, hms(2, 0) + 35 / 60))).toBe(true);
    expect(believable(run(TODAY, 42.195, hms(1, 55)))).toBe(false);
  });

  it('doesn’t believe a walk faster than race walkers go', () => {
    expect(believable(walk(TODAY, 5, 60))).toBe(true);
    expect(believable(walk(TODAY, 5, 15))).toBe(false);
  });
});

describe('distancePoints', () => {
  it('pays every kilometre, walking at half, and nothing for the impossible', () => {
    expect(distancePoints(run(TODAY, 10, 50))).toBe(10);
    expect(distancePoints(run(TODAY, 42.195, hms(4, 0)))).toBeCloseTo(42.2, 1);
    expect(distancePoints(walk(TODAY, 6, 70))).toBe(3);
    expect(distancePoints(run(TODAY, 10, 10))).toBe(0);
  });
});

describe('pacePoints', () => {
  it('pays by tiers of the 5k time a run is worth', () => {
    expect([19, 21, 24, 26, 29, 31].map((minutes) => pacePoints(run(TODAY, 5, minutes)))).toEqual([10, 8, 6, 4, 2, 0]);
  });

  it('evens out the distance, so a marathon at 5:00 a km beats a 5k at 5:00 a km', () => {
    expect(pacePoints(run(TODAY, 42.195, 42.195 * 5))).toBe(8);
    expect(pacePoints(run(TODAY, 5, 25))).toBe(4);
    expect(pacePoints(run(TODAY, 42.195, hms(4, 10)))).toBe(4);
  });

  it('pays nothing for a walk, a short dash or the impossible', () => {
    expect(pacePoints(walk(TODAY, 5, 40))).toBe(0);
    expect(pacePoints(run(TODAY, 1.5, 5))).toBe(0);
    expect(pacePoints(run(TODAY, 5, 10))).toBe(0);
  });
});

describe('runningStats', () => {
  it('adds up the period, distance and pace', () => {
    const runs = [run('2026-10-27', 10, 50), walk('2026-10-28', 6, 70), run('2026-10-29', 5, 24)];
    // 10 + 3 + 5 km points; a 10k in 50:00 is a 24:00 5k, so 6 and 6 pace.
    expect(runningStats(runs, '2026-10-26', TODAY)).toEqual({ km: 21, distance: 18, pace: 12, points: 30 });
  });

  it('caps each week on its own, above a marathon', () => {
    const twoMarathons = [run('2026-10-26', 42.195, hms(4, 0)), run('2026-10-29', 42.195, hms(4, 0))];
    expect(runningStats(twoMarathons, '2026-10-26', TODAY).distance).toBe(60);
    const fastFiveKs = ['2026-10-26', '2026-10-27', '2026-10-28'].map((date) => run(date, 5, 19));
    expect(runningStats(fastFiveKs, '2026-10-26', TODAY).pace).toBe(20);
    const lastWeekToo = [...fastFiveKs, ...['2026-10-19', '2026-10-20', '2026-10-21'].map((date) => run(date, 5, 19))];
    expect(runningStats(lastWeekToo, '2026-10-01', TODAY).pace).toBe(40);
  });

  it('leaves out the impossible', () => {
    expect(runningStats([run('2026-10-27', 10, 10)], '2026-10-26', TODAY)).toEqual({ km: 0, distance: 0, pace: 0, points: 0 });
  });
});

describe('running on the score', () => {
  it('counts only this week for the week', () => {
    expect(weekRunning([run('2026-10-25', 10, 50), run('2026-10-27', 10, 50)], TODAY).km).toBe(10);
  });

  it('adds to the week’s score with no workouts at all', () => {
    // Three 10ks at 50:00: 30 for the distance, 6 each for the pace.
    const runs = ['2026-10-26', '2026-10-27', '2026-10-28'].map((date) => run(date, 10, 50));
    expect(weekScore({ workouts: [], runs }, 3, TODAY, 0)).toBe(30 + 18);
  });

  it('counts all time from the first run', () => {
    const runs = [run('2026-10-20', 10, 50), run('2026-10-27', 10, 50)];
    const first = weekScore({ workouts: [], runs: [runs[0]!] }, 3, '2026-10-25', 0);
    expect(allTimeScore({ workouts: [], runs }, 3, TODAY, new Map())).toBe(first + weekScore({ workouts: [], runs }, 3, TODAY, 0));
  });
});

describe('runTime', () => {
  it('reads times the way a race clock does', () => {
    expect(runTime(3150)).toBe('52:30');
    expect(runTime(11112)).toBe('3:05:12');
    expect(runHeadline(run(TODAY, 10, 52.5))).toBe('Ran 10 km in 52:30');
    expect(runHeadline(walk(TODAY, 6, 70))).toBe('Walked 6 km in 1:10:00');
  });
});

describe('personal bests', () => {
  it('counts a run for a race distance a watch measured a little off, and never a walk', () => {
    expect(pbDistanceOf(run(TODAY, 5.1, 25))?.name).toBe('5k');
    expect(pbDistanceOf(run(TODAY, 42.2, 240))?.name).toBe('Marathon');
    expect(pbDistanceOf(run(TODAY, 7, 35))).toBeUndefined();
    expect(pbDistanceOf(walk(TODAY, 5, 50))).toBeUndefined();
  });

  it('keeps the fastest believable run at a distance', () => {
    const fiveK = pbDistanceOf(run(TODAY, 5, 25))!;
    const runs = [run(TODAY, 5, 25), run(TODAY, 5.05, 24), run(TODAY, 5, 10), run(TODAY, 10, 45)];
    expect(personalBest(runs, fiveK)?.seconds).toBe(24 * 60);
  });

  it('marks a new PB only when it beats an earlier run', () => {
    expect(newPbOf(run(TODAY, 10, 48), [run(TODAY, 10, 50)])?.name).toBe('10k');
    expect(newPbOf(run(TODAY, 10, 52), [run(TODAY, 10, 50)])).toBeNull();
    expect(newPbOf(run(TODAY, 10, 48), [])).toBeNull();
  });
});
