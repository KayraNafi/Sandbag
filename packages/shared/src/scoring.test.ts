import { describe, expect, it } from 'vitest';
import { addDays, dateIn, goalIn, goalsOf, beatABest, believableSet, callPoints, entryMax, estimatedMax, hasWork, mondayOf, nextInviteGoal, overHonestMiss, periodStats, ratingChange, resolveCall, streakBonus, topEntry, trainedDates, weekBonuses, weekPairs, weekStreak } from './scoring';
import { catalogEntry, CATALOG, exerciseKey, exercisesFor, STARTER_WORKOUTS } from './exercises';
import { cleanText, createReplySchema, loggedWorkoutSchema, registerSchema, type Entry } from './schemas';
import { seedOf, voice } from './voice';

const lift = (name: string, weight: number | null) => ({ name, kind: 'strength' as const, weight });
const TODAY = '2026-10-30';

describe('dateIn', () => {
  const at = new Date('2026-11-01T22:30:00Z');

  it('gives the date where you are, so your week ends at your midnight', () => {
    expect(dateIn('Asia/Riyadh', at)).toBe('2026-11-02');
    expect(dateIn('America/Toronto', at)).toBe('2026-11-01');
    expect(dateIn('Pacific/Kiritimati', at)).toBe('2026-11-02');
  });

  it('falls back to UTC when it doesn’t know', () => {
    expect(dateIn(null, at)).toBe('2026-11-01');
    expect(dateIn('Mars/Olympus', at)).toBe('2026-11-01');
  });
});

describe('goals over time', () => {
  // Mondays: 12, 19 and 26 October.
  const history = [{ from: '2000-01-03', goal: 2 }, { from: '2026-10-26', goal: 5 }];
  const twice = ['2026-10-05', '2026-10-06', '2026-10-12', '2026-10-13', '2026-10-19', '2026-10-20'];

  it('finds the goal of the week', () => {
    expect(goalIn(history, '2026-10-25')).toBe(2);
    expect(goalIn(history, '2026-10-26')).toBe(5);
    expect(goalIn(3, '2026-10-26')).toBe(3);
    expect(goalsOf({ weeklyTarget: 4, goalHistory: [] })).toBe(4);
    expect(goalsOf({ weeklyTarget: 4, goalHistory: history })).toBe(history);
  });

  it('keeps a streak earned under an old goal when you raise it', () => {
    expect(weekStreak(twice, history, '2026-10-26').current).toBe(3);
    expect(weekStreak(twice, 5, '2026-10-26').current).toBe(0);
  });

  it('doesn’t let you lower it to rescue the week you’re in', () => {
    const lowered = [{ from: '2000-01-03', goal: 5 }, { from: '2026-11-02', goal: 1 }];
    expect(weekStreak(['2026-10-26'], lowered, '2026-11-01').current).toBe(0);
    expect(weekStreak(['2026-10-26'], 1, '2026-11-01').current).toBe(1);
  });

  it('scores the bonus against the goal of that week', () => {
    const week = ['2026-10-26', '2026-10-27'].map((date) => ({ date, entries: [lift('Curl', 20)] }));
    expect(weekBonuses(week, [{ from: '2000-01-03', goal: 5 }, { from: '2026-11-02', goal: 1 }], '2026-10-27').perfect).toBe(0);
    expect(weekBonuses(week, 1, '2026-10-27').perfect).toBeGreaterThan(0);
  });
});

describe('periodStats', () => {
  const session = (date: string, weights: [string, number][]) => ({ date, entries: weights.map(([name, weight]) => lift(name, weight)) });

  /** Enough sessions behind a lift that it can move by the full limit. */
  const earlier = (weights: [string, number][]) => ['2026-10-06', '2026-10-08', '2026-10-10'].map((date) => session(date, weights));

  it('limits how far one lift moves the average, up or down', () => {
    const before = session('2026-10-10', [['Squat', 60], ['Bench', 100], ['Row', 50], ['Curl', 20]]);
    const fake = session('2026-10-28', [['Squat', 500], ['Bench', 100], ['Row', 50], ['Curl', 20]]);
    expect(periodStats([...earlier([['Squat', 60], ['Bench', 100], ['Row', 50], ['Curl', 20]]), fake], 'week', TODAY).progress).toBe(6.3);
    const slip = session('2026-10-28', [['Squat', 6], ['Bench', 100], ['Row', 50], ['Curl', 20]]);
    expect(periodStats([before, slip], 'week', TODAY).progress).toBe(-6.2);
  });

  it('counts a real jump in full up to the limit', () => {
    const stats = periodStats([...earlier([['Curl', 20]]), session('2026-10-28', [['Curl', 25]])], 'week', TODAY);
    expect(stats.progress).toBe(25);
  });

  it('won’t pay for a low first log straight away', () => {
    const jump = session('2026-10-28', [['Curl', 40]]);
    const after = (dates: string[]) => periodStats([...dates.map((date) => session(date, [['Curl', 20]])), jump], 'week', TODAY).progress;
    expect(after(['2026-10-10'])).toBe(5);
    expect(after(['2026-10-08', '2026-10-10'])).toBe(10);
    expect(after(['2026-10-06', '2026-10-08', '2026-10-10'])).toBe(25);
    expect(periodStats([session('2026-10-10', [['Curl', 20]]), session('2026-10-28', [['Curl', 5]])], 'week', TODAY).progress).toBe(-25);
  });

  it('measures progress against the last number before the period', () => {
    const stats = periodStats(
      [
        { date: '2026-10-06', entries: [lift('Lat pulldown', 80)] },
        { date: '2026-10-08', entries: [lift('Lat pulldown', 80)] },
        { date: '2026-10-10', entries: [lift('Lat pulldown', 80)] },
        { date: '2026-10-28', entries: [lift('Lat pulldown', 88)] },
      ],
      'week', TODAY,
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
      'week', TODAY,
    );
    expect(stats.progress).toBe(5);
  });

  it('averages exercises so one big jump cannot carry the score', () => {
    const stats = periodStats(
      [
        { date: '2026-09-27', entries: [lift('A', 100), lift('B', 100)] },
        { date: '2026-09-29', entries: [lift('A', 100), lift('B', 100)] },
        { date: '2026-10-01', entries: [lift('A', 100), lift('B', 100)] },
        { date: '2026-10-29', entries: [lift('A', 120), lift('B', 100)] },
      ],
      'week', TODAY,
    );
    expect(stats.progress).toBe(10);
  });

  it('caps consistency and floors negative progress points', () => {
    const stats = periodStats(
      [
        { date: '2026-10-01', entries: [lift('A', 100)] },
        { date: '2026-10-27', entries: [lift('A', 50)] },
        { date: '2026-10-28', entries: [lift('A', 50)] },
        { date: '2026-10-29', entries: [lift('A', 50)] },
        { date: '2026-10-30', entries: [lift('A', 50)] },
      ],
      'week', TODAY,
    );
    expect(stats.progress).toBe(-25);
    expect(stats.consistency).toBe(100);
    expect(stats.score).toBe(50);
  });

  it('ignores timed work, empty weights and future dates', () => {
    const stats = periodStats(
      [
        { date: '2026-10-29', entries: [{ name: 'Rope', kind: 'time', weight: null, minutes: 5 }, lift('A', null)] },
        { date: '2026-11-05', entries: [lift('A', 100)] },
      ],
      'week', TODAY,
    );
    expect(stats.progress).toBe(0);
    expect(stats.workouts).toBe(1);
  });

  it('handles someone with no workouts', () => {
    expect(periodStats([], 'month', TODAY)).toEqual({ progress: 0, workouts: 0, consistency: 0, score: 0 });
  });
});

describe('resolveCall', () => {
  it('needs strictly more than the called weight', () => {
    expect(resolveCall(86, 88.5)).toBe('cleared');
    expect(resolveCall(86, 86)).toBe('failed');
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
    expect(weekStreak(dates, 3, '2026-10-30')).toMatchObject({ current: 2, best: 2 });
  });

  it('adds this week as soon as the target is met', () => {
    const dates = [...week('2026-10-19', 3), ...week('2026-10-26', 3)];
    expect(weekStreak(dates, 3, '2026-10-28').current).toBe(2);
  });

  it('breaks on a missed week, and remembers the best run', () => {
    const dates = [...week('2026-09-28', 3), ...week('2026-10-05', 3), ...week('2026-10-12', 3), ...week('2026-10-26', 3)];
    expect(weekStreak(dates, 3, '2026-10-30')).toMatchObject({ current: 1, best: 3 });
  });

  it('ends a streak once a whole week goes by', () => {
    expect(weekStreak(week('2026-10-05', 3), 3, '2026-10-30').current).toBe(0);
  });

  it('copes with nothing', () => {
    expect(weekStreak([], 3, '2026-10-30')).toEqual({ current: 0, best: 0, shields: 0 });
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

// Each test states the behaviour a fair ranking should have.
describe('ranking flaws', () => {
  const day = (date: string, ...entries: { name: string; kind: 'strength'; weight: number | null }[]) => ({ date, entries });
  // Monday to Friday of the week holding TODAY, which is a Friday.
  const MONDAY = '2026-10-26';

  describe('1: empty and repeated workouts', () => {
    it('does not count a workout with no exercises', () => {
      const stats = periodStats([day('2026-10-27'), day('2026-10-28'), day('2026-10-29')], 'week', TODAY);
      expect(stats.workouts).toBe(0);
      expect(stats.consistency).toBe(0);
    });

    it('counts at most one workout per day', () => {
      const sameDay = Array.from({ length: 7 }, () => day('2026-10-29', lift('Squat', 100)));
      const stats = periodStats(sameDay, 'week', TODAY);
      expect(stats.workouts).toBe(1);
      expect(stats.consistency).toBe(25);
    });
  });

  describe('2: weight setup', () => {
    const setup = (name: string, weight: number, perSide: boolean, includesEquipment?: boolean) => ({ ...lift(name, weight), perSide, includesEquipment });

    it('sees no gain from switching "40 each side" to "100 total"', () => {
      const stats = periodStats([day('2026-10-10', setup('Squat', 40, true)), day('2026-10-28', setup('Squat', 100, false))], 'week', TODAY);
      expect(stats.progress).toBe(0);
    });

    it('sees no gain from starting to count the bar', () => {
      const stats = periodStats([day('2026-10-10', setup('Squat', 60, false, false)), day('2026-10-28', setup('Squat', 80, false, true))], 'week', TODAY);
      expect(stats.progress).toBe(0);
    });

    it('sees no gain when an older entry never said whether the bar counted', () => {
      const stats = periodStats([day('2026-10-10', setup('Squat', 60, false)), day('2026-10-28', setup('Squat', 80, false, true))], 'week', TODAY);
      expect(stats.progress).toBe(0);
    });

    it('still compares against the last number with the same setup', () => {
      const stats = periodStats(
        [day('2026-10-05', setup('Squat', 40, true)), day('2026-10-10', setup('Squat', 100, false)), day('2026-10-28', setup('Squat', 42, true))],
        'week', TODAY,
      );
      expect(stats.progress).toBe(5);
    });
  });

  describe('3: progress saturation', () => {
    it('scores a 25% average gain above a 10% one', () => {
      const score = (weight: number) => periodStats([day('2026-10-06', lift('Squat', 100)), day('2026-10-08', lift('Squat', 100)), day('2026-10-10', lift('Squat', 100)), day('2026-10-28', lift('Squat', weight))], 'week', TODAY).score;
      expect(score(125)).toBeGreaterThan(score(110));
    });
  });

  describe('4: reps and sets', () => {
    it('scores 100 kg x 12 above 100 kg x 1', () => {
      const withReps = (reps: number) => ({ ...lift('Squat', 100), reps });
      const stats = periodStats([day('2026-10-10', withReps(1)), day('2026-10-28', withReps(12))], 'week', TODAY);
      expect(stats.progress).toBeGreaterThan(0);
    });
  });

  describe('5: self-set target', () => {
    it('scores days trained, with no goal involved at all', () => {
      const days = (count: number) => Array.from({ length: count }, (_, index) => day(`2026-10-${26 + index}`, lift('Squat', 100)));
      expect(periodStats(days(1), 'week', TODAY).consistency).toBe(25);
      expect(periodStats(days(4), 'week', TODAY).consistency).toBe(100);
    });
  });

  describe('6: what a week means', () => {
    it('agrees with the streak about which workouts are in this week', () => {
      const dates = ['2026-10-24', '2026-10-25', MONDAY];
      const workouts = dates.map((date) => day(date, lift('Squat', 100)));
      expect(weekStreak(dates, 3, TODAY).current).toBe(0);
      const stats = periodStats(workouts, 'week', TODAY);
      expect(stats.workouts).toBe(1);
      expect(stats.consistency).toBe(25);
    });

    it('measures this week against the number from before Monday', () => {
      const stats = periodStats([day('2026-10-20', lift('Squat', 100)), day('2026-10-25', lift('Squat', 105)), day('2026-10-28', lift('Squat', 110))], 'week', TODAY);
      expect(stats.progress).toBe(4.8);
    });

    it('starts on Monday and runs through Sunday', () => {
      const workouts = [day('2026-10-25', lift('Squat', 100)), day(MONDAY, lift('Squat', 100)), day('2026-11-01', lift('Squat', 100))];
      expect(periodStats(workouts, 'week', MONDAY).workouts).toBe(1);
      expect(periodStats(workouts, 'week', '2026-11-01').workouts).toBe(2);
    });

    it('still allows for a phone a day ahead of the server', () => {
      expect(periodStats([day('2026-10-31', lift('Squat', 100))], 'week', TODAY).workouts).toBe(1);
    });

    it('leaves the month as a rolling 30 days', () => {
      const workouts = [day('2026-09-30', lift('Squat', 100)), day('2026-10-01', lift('Squat', 100))];
      expect(periodStats(workouts, 'month', TODAY).workouts).toBe(1);
    });
  });

  describe('7: exercise names', () => {
    it('keeps the baseline through a typo', () => {
      const stats = periodStats([day('2026-10-06', lift('Bench press', 100)), day('2026-10-08', lift('Bench press', 100)), day('2026-10-10', lift('Bench press', 100)), day('2026-10-28', lift('Bench pres', 110))], 'week', TODAY);
      expect(stats.progress).toBe(10);
    });

    it('cannot hide a drop by renaming the lift', () => {
      const stats = periodStats([day('2026-10-10', lift('Bench press', 100)), day('2026-10-28', lift('Bench press (barbell)', 80))], 'week', TODAY);
      expect(stats.progress).toBe(-20);
    });
  });
});

describe('ways to cheat the score', () => {
  const at = (date: string, weight: number, extra: object = {}) => ({ date, entries: [{ ...lift('Squat', weight), ...extra }] });

  it('gives tanking a week and coming back nothing', () => {
    const stats = periodStats([at('2026-10-12', 100), at('2026-10-22', 60), at('2026-10-28', 100)], 'week', TODAY);
    expect(stats.progress).toBe(0);
  });

  it('doesn’t punish a light day after a heavy one', () => {
    const stats = periodStats([at('2026-10-08', 100), at('2026-10-10', 100), at('2026-10-12', 100), at('2026-10-27', 110), at('2026-10-28', 80)], 'week', TODAY);
    expect(stats.progress).toBe(10);
  });

  it('still counts a whole period below the baseline', () => {
    const stats = periodStats([at('2026-10-12', 100), at('2026-10-27', 80), at('2026-10-28', 85)], 'week', TODAY);
    expect(stats.progress).toBe(-15);
  });

  it('won’t take a best from a number written up weeks later', () => {
    const old = { ...at('2026-10-20', 150), recordedAt: '2026-10-30T12:00:00Z' };
    const stats = periodStats([at('2026-09-25', 100), old, at('2026-10-28', 100)], 'month', TODAY);
    expect(stats.progress).toBe(0);
  });

  it('picks the heavy entry when a session holds a lift twice', () => {
    const light = { ...lift('Squat', 60), reps: 5 };
    const heavy = { ...lift('Squat', 100), reps: 5 };
    expect(topEntry([light, heavy])?.entry).toBe(heavy);
    expect(topEntry([lift('Squat', null)])).toBeNull();
  });

  it('pays an honest +2.5 kg more than holding steady', () => {
    const held = periodStats([at('2026-10-22', 100), at('2026-10-28', 100)], 'week', TODAY);
    const gained = periodStats([at('2026-10-22', 100), at('2026-10-28', 102.5)], 'week', TODAY);
    expect(gained.score).toBeGreaterThan(held.score + 10);
  });

  it('ignores a low number backdated long after the fact', () => {
    const fake = { ...at('2026-09-20', 1), recordedAt: '2026-10-29T10:00:00Z' };
    expect(periodStats([fake, at('2026-10-29', 100)], 'week', TODAY).progress).toBe(0);
  });

  it('trusts a session backfilled within the week', () => {
    const forgot = { ...at('2026-10-20', 100), recordedAt: '2026-10-27T10:00:00Z' };
    expect(periodStats([at('2026-10-16', 100), at('2026-10-18', 100), forgot, at('2026-10-29', 110)], 'week', TODAY).progress).toBe(10);
  });

  it('counts a lift you stopped doing as no gain once the week is over', () => {
    const both = (date: string, weight: number) => ({ date, entries: [lift('Squat', weight), lift('Bench press', 100)] });
    const workouts = [both('2026-10-05', 100), both('2026-10-12', 100), { date: '2026-10-21', entries: [lift('Squat', 110)] }];
    expect(periodStats(workouts, 'week', '2026-10-25').progress).toBe(5);
    // Midweek it might still be coming, so it isn't counted yet.
    expect(periodStats(workouts, 'week', '2026-10-23').progress).toBe(10);
  });

  it('caps what high reps can claim', () => {
    expect(estimatedMax(60, 50)).toBe(estimatedMax(60, 12));
    expect(estimatedMax(60, 12)).toBeLessThan(estimatedMax(100, 8));
  });

  it('doesn’t count claimed effort towards strength', () => {
    const easy = { ...lift('Squat', 100), reps: 8, rpe: 5 };
    const hard = { ...lift('Squat', 100), reps: 8, rpe: 10 };
    expect(entryMax(easy)).toBe(entryMax(hard));
  });

  it('won’t count a name with no numbers as training', () => {
    expect(hasWork(lift('Anything', null))).toBe(false);
    expect(hasWork({ ...lift('Pull-up', null), reps: 8 })).toBe(true);
    expect(trainedDates([{ date: '2026-10-29', entries: [lift('Anything', null)] }])).toEqual([]);
  });

  it('uses the best set when sets differ', () => {
    const pyramid = { ...lift('Squat', 80), setWeights: [60, 70, 80], setReps: [10, 8, 6] };
    expect(entryMax(pyramid)).toBeCloseTo(estimatedMax(80, 6));
  });

  it('won’t call 40 each side then 100 total a new best', () => {
    const first = { date: '2026-10-01', entries: [{ ...lift('Squat', 40), perSide: true }] };
    const second = { date: '2026-10-02', entries: [{ ...lift('Squat', 100), perSide: false }] };
    expect(beatABest([first, second])).toBe(false);
  });
});

describe('sandbag calls', () => {
  it('watches a close miss at full effort rather than punishing it', () => {
    expect(resolveCall(100, 96, 9)).toBe('watching');
    expect(resolveCall(100, 96, 8)).toBe('failed');
    expect(resolveCall(100, 90, 10)).toBe('failed');
    expect(resolveCall(100, 96)).toBe('failed');
  });

  it('catches lifting well past what you said was your limit', () => {
    expect(overHonestMiss(100, 105)).toBe(true);
    expect(overHonestMiss(100, 104)).toBe(false);
  });

  it('puts both sides at stake, and a watched miss costs nobody', () => {
    expect(callPoints('cleared', 'target')).toBeGreaterThan(0);
    expect(callPoints('cleared', 'caller')).toBeLessThan(0);
    expect(callPoints('failed', 'target')).toBeLessThan(0);
    expect(callPoints('failed', 'caller')).toBeGreaterThan(0);
    expect(callPoints('confirmed', 'target')).toBe(2 * callPoints('failed', 'target'));
    expect(callPoints('honest', 'target')).toBe(0);
    expect(callPoints('watching', 'caller')).toBe(0);
    expect(callPoints('open', 'target')).toBe(0);
  });
});

describe('streak shields', () => {
  const weeks = (first: string, count: number, days = 3) => Array.from({ length: count }, (_, week) => Array.from({ length: days }, (_, day) => {
    const date = new Date(`${first}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + week * 7 + day);
    return date.toISOString().slice(0, 10);
  })).flat();

  it('counts each day once, however many sessions it held', () => {
    expect(weekStreak(['2026-10-26', '2026-10-26', '2026-10-26'], 3, '2026-10-30').current).toBe(0);
  });

  it('earns a shield every 4 weeks, which saves one missed week', () => {
    const dates = [...weeks('2026-09-07', 4), ...weeks('2026-10-12', 2)];
    expect(weekStreak(dates, 3, '2026-10-30')).toEqual({ current: 6, best: 6, shields: 0 });
  });

  it('resets to zero with no shield left, and remembers the best', () => {
    const dates = [...weeks('2026-09-07', 4), ...weeks('2026-10-19', 1)];
    // The shield covers the first gap and the second resets it, then one more week, then two gaps again.
    expect(weekStreak(dates, 3, '2026-11-09')).toMatchObject({ current: 0, best: 4 });
  });

  it('holds at most 2 shields', () => {
    expect(weekStreak(weeks('2026-05-04', 24), 3, '2026-10-18').shields).toBe(2);
  });

  it('holds a paused week without adding to it', () => {
    const dates = [...weeks('2026-10-05', 2), ...weeks('2026-10-26', 1)];
    expect(weekStreak(dates, 3, '2026-10-30').current).toBe(1);
    expect(weekStreak(dates, 3, '2026-10-30', ['2026-10-19']).current).toBe(3);
  });

  it('ignores weeks that haven’t happened', () => {
    expect(weekStreak(weeks('2099-01-05', 5), 3, '2026-10-30').best).toBe(0);
  });
});

describe('bonuses', () => {
  const session = (date: string, weight = 100) => ({ date, entries: [lift('Squat', weight)] });
  const monday = '2026-10-26';

  it('pays more for longer streaks and bigger goals', () => {
    expect(streakBonus(1, 4)).toBe(0);
    expect(streakBonus(2, 2)).toBe(1);
    expect(streakBonus(12, 2)).toBe(4);
    expect(streakBonus(12, 3)).toBe(6);
    expect(streakBonus(12, 7)).toBe(8);
  });

  it('can’t let a long streak outweigh actually training', () => {
    const veteranBonus = streakBonus(30, 7);
    expect(25 / 2 + veteranBonus).toBeLessThan(100 / 2);
  });

  it('pays a comeback only after a real miss, and only once you’ve hit your goal', () => {
    const earlier = [session('2026-10-05'), session('2026-10-06')];
    const back = [session(monday), session('2026-10-27')];
    expect(weekBonuses([...earlier, ...back], 2, TODAY).comeback).toBe(3);
    expect(weekBonuses([...earlier, session(monday)], 2, TODAY).comeback).toBe(0);
    expect(weekBonuses(back, 2, TODAY).comeback).toBe(0);
    expect(weekBonuses([...earlier, ...back], 2, TODAY, { pausedWeeks: ['2026-10-19'] }).comeback).toBe(0);
  });

  it('pays for beating your goal by a day', () => {
    const three = [session(monday), session('2026-10-27'), session('2026-10-28')];
    expect(weekBonuses(three, 2, TODAY).perfect).toBe(2);
    expect(weekBonuses(three, 3, TODAY).perfect).toBe(0);
  });

  it('needs history before a new best pays', () => {
    expect(weekBonuses([session(monday, 120)], 2, TODAY).newBest).toBe(0);
    expect(weekBonuses([session('2026-10-01'), session(monday, 120)], 2, TODAY).newBest).toBe(0);
    expect(weekBonuses([session('2026-10-01'), session('2026-10-02'), session(monday, 120)], 2, TODAY).newBest).toBe(2);
  });

  it('won’t pay a new best for a number backdated into history', () => {
    const fake = { ...session('2026-09-01', 1), recordedAt: '2026-10-25T00:00:00Z' };
    expect(weekBonuses([fake, { ...fake, date: '2026-09-02' }, session(monday, 2)], 2, TODAY).newBest).toBe(0);
  });

  it('pays nothing during a pause, and calls still count', () => {
    const three = [session(monday), session('2026-10-27'), session('2026-10-28')];
    expect(weekBonuses(three, 2, TODAY, { pausedWeeks: [monday], calls: 5 })).toMatchObject({ perfect: 0, streak: 0, total: 5 });
  });

  it('caps what calls can add or cost, so friends can’t trade their way up', () => {
    expect(weekBonuses([], 2, TODAY, { calls: 50 }).calls).toBe(10);
    expect(weekBonuses([], 2, TODAY, { calls: -50 }).calls).toBe(-10);
  });

  it('caps the bonuses, leaving calls apart', () => {
    const many = Array.from({ length: 7 }, (_, index) => session(addDays(monday, index)));
    const total = weekBonuses(many, 2, '2026-11-01', { crewHitGoal: true }).total;
    expect(total).toBeLessThanOrEqual(15);
  });

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
  });
});

describe('weekPairs', () => {
  const people = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('has everyone meet everyone over a full round', () => {
    const met = new Set<string>();
    for (let week = 0; week < people.length - 1; week += 1) {
      const { pairs, bye } = weekPairs(people, week);
      expect(bye).toBeNull();
      expect(pairs.flat().sort()).toEqual(people);
      for (const pair of pairs) met.add([...pair].sort().join());
    }
    expect(met.size).toBe(15);
  });

  it('rotates the bye through an odd crew', () => {
    const odd = ['a', 'b', 'c', 'd', 'e'];
    const byes = new Set(Array.from({ length: 5 }, (_, week) => weekPairs(odd, week).bye));
    expect(byes).toEqual(new Set(odd));
  });

  it('gives the same result whatever order members arrive in', () => {
    expect(weekPairs(['d', 'a', 'c', 'b'], 2)).toEqual(weekPairs(['a', 'b', 'c', 'd'], 2));
  });

  it('copes with one person and nobody', () => {
    expect(weekPairs(['a'], 0)).toEqual({ pairs: [], bye: 'a' });
    expect(weekPairs([], 0)).toEqual({ pairs: [], bye: null });
  });
});

describe('ratingChange', () => {
  it('moves both sides equally and pays more for an upset', () => {
    expect(ratingChange(1000, 1000, 80, 40)).toBe(16);
    expect(ratingChange(1000, 1000, 40, 80)).toBe(-16);
    expect(ratingChange(1000, 1000, 50, 50)).toBe(0);
    expect(ratingChange(900, 1100, 80, 40)).toBeGreaterThan(ratingChange(1100, 900, 80, 40));
  });
});

describe('exercise names', () => {
  it('treats what people type as the same lift', () => {
    for (const typed of ['Bench', 'bench press', 'BENCH  PRESS', 'Bench pres', 'Bench press (barbell)', 'flat bench', 'Benchpress']) {
      expect(exerciseKey(typed), typed).toBe('bench press');
    }
  });

  it('keeps different lifts apart, even a letter away', () => {
    expect(exerciseKey('Hack squat')).toBe('hack squat');
    expect(exerciseKey('Squat')).toBe('squat');
    expect(exerciseKey('Leg press')).not.toBe(exerciseKey('Bench press'));
  });

  it('leaves names it doesn’t know as typed, and short ones alone', () => {
    expect(exerciseKey('My weird  Thing')).toBe('my weird thing');
    expect(exerciseKey('Row')).toBe('row');
  });

  it('finds lifts by muscle, equipment and words', () => {
    expect(exercisesFor('chest', 'machine').map((item) => item.name)).toContain('Pec deck');
    expect(exercisesFor(null, null, 'rdl').map((item) => item.name)).toEqual(['Romanian deadlift']);
  });

  it('has a sound catalog', () => {
    const names = CATALOG.map((item) => exerciseKey(item.name));
    expect(new Set(names).size).toBe(names.length);
    for (const item of CATALOG) {
      expect(catalogEntry(item.name)?.name, item.name).toBe(item.name);
      for (const alias of item.aliases ?? []) expect(exerciseKey(alias), alias).toBe(exerciseKey(item.name));
    }
    for (const starter of STARTER_WORKOUTS) for (const name of starter.exercises) expect(catalogEntry(name), name).toBeDefined();
  });
});

describe('the voice', () => {
  const lines: ((seed: number) => string)[] = [
    (seed) => voice.weightUp('2.5', seed), (seed) => voice.weightDown(seed), (seed) => voice.sameWeight('100', seed), (seed) => voice.rpeTen(seed), (seed) => voice.rpeLow(seed),
    (seed) => voice.overLimit('2000 kg', seed), (seed) => voice.finished(seed), (seed) => voice.allDone(seed), (seed) => voice.needWeight(seed), (seed) => voice.rest(seed),
    (seed) => voice.noBest(seed), (seed) => voice.noWay('1620', seed), (seed) => voice.leftOut('Squat', '1620', seed), (seed) => voice.allJokes(seed), (seed) => voice.tooMuch(seed),
    (seed) => voice.zeroReps(seed), (seed) => voice.tinyWeight('0.5', seed), (seed) => voice.manyReps(50, seed), (seed) => voice.shortRest(seed), (seed) => voice.longRest(seed),
    (seed) => voice.undoSet(seed), (seed) => voice.deleted(seed), (seed) => voice.skipped(1, seed), (seed) => voice.again('Lower', seed), (seed) => voice.speedrun(8, 1, seed),
    (seed) => voice.noNap(seed), (seed) => voice.firstSession(seed), (seed) => voice.nudge(seed), (seed) => voice.nudgeSent('Rocco', seed), (seed) => voice.recapHit(3, seed),
    (seed) => voice.recapMissed(1, seed), (seed) => voice.lighterSession('Lower', seed), (seed) => voice.quiet(5, seed), (seed) => voice.streak(4, seed),
  ];

  it('always has something to say, whatever the seed', () => {
    for (const say of lines) for (const seed of [0, 1, 2, 3, 7, 9972, Date.now(), -5, 1.5]) expect(say(seed)).toMatch(/^[^\s].*\S$/);
  });

  it('has more than one thing to say', () => {
    for (const say of lines) expect(new Set([0, 1, 2, 3, 4, 5].map(say)).size).toBeGreaterThan(1);
  });

  it('says the same thing about the same session every time', () => {
    expect(voice.noBest(seedOf('some-session'))).toBe(voice.noBest(seedOf('some-session')));
  });

  it('gets the grammar right for one lift', () => {
    expect(voice.skipped(1)).toContain('1 lift skipped');
    expect(voice.skipped(2)).toContain('2 lifts skipped');
  });
});

describe('jokes and typos', () => {
  const lift = (name: string, weight: number | null, reps: number | null, extra: Partial<Entry> = {}): Entry => ({ id: 'x', name, kind: 'strength', sets: 3, reps, weight, perSide: false, rpe: null, minutes: null, note: '', ...extra });

  it('believes the all-time records, on every kind of kit', () => {
    expect(believableSet(lift('Deadlift', null, 1), 501, 1)).toBe(true);
    expect(believableSet(lift('Leg press', null, 8), 500, 8)).toBe(true);
    expect(believableSet(lift('My own weird lift', null, 5), 300, 5)).toBe(true);
  });

  it('does not believe the rest', () => {
    expect(believableSet(lift('Romanian deadlift', null, 17), 1620, 17)).toBe(false);
    expect(believableSet(lift('Deadlift', null, 1), 800, 1)).toBe(false);
    expect(believableSet(lift('My own weird lift', null, 1), 2000, 1)).toBe(false);
  });

  it('counts both sides of a per-side weight', () => {
    expect(believableSet(lift('Squat', null, 1), 400, 1)).toBe(true);
    expect(believableSet(lift('Squat', null, 1, { perSide: true }), 400, 1)).toBe(false);
  });

  it('does not believe a light weight for a thousand reps either', () => {
    expect(estimatedMax(100, 1000)).toBeLessThan(200);
    expect(believableSet(lift('Squat', null, 1000), 100, 1000)).toBe(false);
  });

  it('treats zero reps as nothing lifted, and no reps recorded as fine', () => {
    expect(entryMax(lift('Squat', 200, 0))).toBeNull();
    expect(hasWork(lift('Squat', 200, 0))).toBe(false);
    expect(entryMax(lift('Squat', 200, null))).toBe(200);
  });

  it('keeps the real sets of a partly joke entry', () => {
    const entry = lift('Squat', 1620, 5, { setWeights: [100, 100, 1620], setReps: [5, 5, 5] });
    expect(entryMax(entry)).toBeCloseTo(estimatedMax(100, 5));
  });

  it('gives a joke nothing to score, no best and no training day', () => {
    const joke = lift('Squat', 2000, 8);
    expect(entryMax(joke)).toBeNull();
    expect(topEntry([joke])).toBeNull();
    expect(hasWork(joke)).toBe(false);
    expect(trainedDates([{ date: '2026-11-03', entries: [joke] }])).toEqual([]);
    const weeks = [{ date: '2026-10-20', entries: [lift('Squat', 100, 5)] }, { date: '2026-11-03', entries: [joke] }];
    expect(periodStats(weeks, 'week', '2026-11-03').progress).toBe(0);
  });

  it('still counts bodyweight reps and timed work', () => {
    expect(hasWork(lift('Push-up', null, 1000))).toBe(true);
    expect(hasWork({ ...lift('Plank', null, null), kind: 'time', minutes: 1440 })).toBe(true);
  });
});

describe('what you moved', () => {
  const claims: [number, string][] = [[1, 'sugar'], [400, 'piano'], [1000, 'small car'], [2640, 'hippo'], [7000, 'elephant'], [12000, 'bus'], [40000, 'lorry'], [139680, 'whale'], [400000, 'jumbo'], [7000000, 'Eiffel'], [8000000000, 'Pyramid']];

  it.each(claims)('compares %d kg to the right thing', (kg, thing) => {
    expect(voice.lifted(kg)).toContain(thing);
  });

  it('has a line for anything, from a fraction of a kilo to the most a session can hold', () => {
    for (const kg of [0.1, 1.5, 39, 41, 999.5, 1001, 6e6, 1e8, 8e9]) expect(voice.lifted(kg)).toMatch(/^That’s /);
  });
});

describe('cleanText', () => {
  it('leaves normal names alone, in any language', () => {
    for (const name of ['Big Lad', 'أحمد العربي', 'مُحَمَّد', 'می‌خواهم', '🏋️ Big Lad 💪', '👨‍👩‍👧', '<script>alert(1)</script>', "Robert'); DROP TABLE users;--"]) expect(cleanText(name)).toBe(name);
  });

  it('removes direction overrides and hidden characters', () => {
    expect(cleanText('nimda\u202e')).toBe('nimda');
    expect(cleanText('a\u200bb\u0000c')).toBe('abc');
  });

  it('calms zalgo down without breaking the word', () => {
    expect(cleanText('a\u0301\u0302\u0303\u0304\u0305\u0306\u0307b')).toBe('a\u0301\u0302\u0303b');
  });

  it('puts everything on one line', () => {
    expect(cleanText(`one${'\n'.repeat(140)}two   three\t`)).toBe('one two three');
  });

  it('has nothing to say about text with nothing in it', () => {
    for (const blank of ['', '   ', '\u200b\u200b', '\u200d', '\u0301\u0302', '\n\n']) expect(cleanText(blank)).toBe('');
  });

  it('is what the server checks, so an invisible name is refused', () => {
    const account = { username: 'someone', password: 'long enough password', inviteCode: 'code' };
    expect(registerSchema.safeParse({ ...account, displayName: '\u200b\u200b' }).success).toBe(false);
    expect(registerSchema.parse({ ...account, displayName: ' Big\u202e Lad ' }).displayName).toBe('Big Lad');
    expect(createReplySchema.safeParse({ text: '\u200b' }).success).toBe(false);
    const workout = { id: 'a', date: '2026-11-03', title: 'x', savedWorkoutId: null, entries: [], updatedAt: 1, deleted: false };
    expect(loggedWorkoutSchema.safeParse({ ...workout, title: '\u200b' }).success).toBe(false);
  });
});

describe('jokes and typos', () => {
  const lift = (name: string, weight: number | null, reps: number | null, extra: Partial<Entry> = {}): Entry => ({ id: 'x', name, kind: 'strength', sets: 3, reps, weight, perSide: false, rpe: null, minutes: null, note: '', ...extra });

  it('believes the all-time records, on every kind of kit', () => {
    expect(believableSet(lift('Deadlift', null, 1), 501, 1)).toBe(true);
    expect(believableSet(lift('Leg press', null, 8), 500, 8)).toBe(true);
    expect(believableSet(lift('My own weird lift', null, 5), 300, 5)).toBe(true);
  });

  it('does not believe the rest', () => {
    expect(believableSet(lift('Romanian deadlift', null, 17), 1620, 17)).toBe(false);
    expect(believableSet(lift('Deadlift', null, 1), 800, 1)).toBe(false);
    expect(believableSet(lift('My own weird lift', null, 1), 2000, 1)).toBe(false);
  });

  it('counts both sides of a per-side weight', () => {
    expect(believableSet(lift('Squat', null, 1), 400, 1)).toBe(true);
    expect(believableSet(lift('Squat', null, 1, { perSide: true }), 400, 1)).toBe(false);
  });

  it('does not believe a light weight for a thousand reps either', () => {
    expect(estimatedMax(100, 1000)).toBeLessThan(200);
    expect(believableSet(lift('Squat', null, 1000), 100, 1000)).toBe(false);
  });

  it('treats zero reps as nothing lifted, and no reps recorded as fine', () => {
    expect(entryMax(lift('Squat', 200, 0))).toBeNull();
    expect(hasWork(lift('Squat', 200, 0))).toBe(false);
    expect(entryMax(lift('Squat', 200, null))).toBe(200);
  });

  it('keeps the real sets of a partly joke entry', () => {
    const entry = lift('Squat', 1620, 5, { setWeights: [100, 100, 1620], setReps: [5, 5, 5] });
    expect(entryMax(entry)).toBeCloseTo(estimatedMax(100, 5));
  });

  it('gives a joke nothing to score, no best and no training day', () => {
    const joke = lift('Squat', 2000, 8);
    expect(entryMax(joke)).toBeNull();
    expect(topEntry([joke])).toBeNull();
    expect(hasWork(joke)).toBe(false);
    expect(trainedDates([{ date: '2026-11-03', entries: [joke] }])).toEqual([]);
    const weeks = [{ date: '2026-10-20', entries: [lift('Squat', 100, 5)] }, { date: '2026-11-03', entries: [joke] }];
    expect(periodStats(weeks, 'week', '2026-11-03').progress).toBe(0);
  });

  it('still counts bodyweight reps and timed work', () => {
    expect(hasWork(lift('Push-up', null, 1000))).toBe(true);
    expect(hasWork({ ...lift('Plank', null, null), kind: 'time', minutes: 1440 })).toBe(true);
  });
});
