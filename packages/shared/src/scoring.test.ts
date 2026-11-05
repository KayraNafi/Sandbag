import { describe, expect, it } from 'vitest';
import type { Entry } from './schemas';
import { allTimeScore, beatABest, changeGoal, goalIn, nextInviteGoal, periodStats, streakBonus, weekBonuses, weekScore, weekStreak, type GoalChange, type ScoringWorkout } from './scoring';

// A Friday. Its week began on Monday 2026-10-26.
const TODAY = '2026-10-30';

describe('periodStats', () => {
  const lift = (name: string, weight: number | null, extra: Partial<Entry> = {}): Entry => ({
    id: name, name, kind: 'strength', sets: 3, reps: 8, weight, perSide: false, rpe: null, minutes: null, note: '', ...extra,
  });
  const session = (date: string, entries: Entry[], recordedAt?: Date): ScoringWorkout => ({ date, entries, ...(recordedAt ? { recordedAt } : {}) });
  /** Three ordinary weeks of a lift before this one, so no new-lift cap applies. */
  const history = (name: string, weight: number) => ['2026-10-06', '2026-10-13', '2026-10-20'].map((date) => session(date, [lift(name, weight)]));
  const progressOf = (workouts: ScoringWorkout[]) => periodStats(workouts, 'week', 3, TODAY).progress;

  it('compares your best this week with your best of the four weeks before', () => {
    const tanked = [session('2026-10-13', [lift('Bench', 100)]), session('2026-10-16', [lift('Bench', 100)]), session('2026-10-20', [lift('Bench', 80)])];
    expect(progressOf([...tanked, session('2026-10-27', [lift('Bench', 105)])])).toBe(5);
  });

  it('counts your best session, so a light day costs nothing', () => {
    expect(progressOf([...history('Bench', 100), session('2026-10-27', [lift('Bench', 105)]), session('2026-10-29', [lift('Bench', 90)])])).toBe(5);
  });

  it('counts more reps at the same weight as progress', () => {
    expect(progressOf([...history('Bench', 100), session('2026-10-27', [lift('Bench', 100, { reps: 10 })])])).toBe(5.4);
  });

  it('only counts the lifts you did', () => {
    const before = [...history('Bench', 100), ...history('Squat', 100)];
    expect(progressOf([...before, session('2026-10-27', [lift('Bench', 105)])])).toBe(5);
  });

  it('limits one lift to 25% either way', () => {
    expect(progressOf([...history('Bench', 100), session('2026-10-27', [lift('Bench', 200)])])).toBe(25);
    expect(progressOf([...history('Bench', 100), session('2026-10-27', [lift('Bench', 10)])])).toBe(-25);
  });

  it('lets a new lift climb only a little at first', () => {
    expect(progressOf([session('2026-10-27', [lift('Curl', 10)]), session('2026-10-29', [lift('Curl', 20)])])).toBe(5);
    expect(progressOf([session('2026-10-13', [lift('Curl', 10)]), session('2026-10-20', [lift('Curl', 10)]), session('2026-10-27', [lift('Curl', 20)])])).toBe(10);
  });

  it('compares weights only when they were weighed the same way', () => {
    const perSide = ['2026-10-06', '2026-10-13', '2026-10-20'].map((date) => session(date, [lift('Bench', 50, { perSide: true })]));
    expect(progressOf([...perSide, session('2026-10-27', [lift('Bench', 100)])])).toBe(0);
  });

  it('doesn’t let a session written up long after its day set a best or a baseline', () => {
    const late = session('2026-10-27', [lift('Bench', 150)], new Date('2026-11-06T12:00:00Z'));
    expect(progressOf([...history('Bench', 100), late])).toBe(0);
    const lateBase = session('2026-10-13', [lift('Bench', 200)], new Date('2026-10-29T12:00:00Z'));
    expect(progressOf([...history('Bench', 100), lateBase, session('2026-10-27', [lift('Bench', 105)])])).toBe(5);
  });

  it('runs Monday to Sunday', () => {
    expect(periodStats([...history('Bench', 100), session('2026-10-25', [lift('Bench', 120)])], 'week', 3, TODAY)).toMatchObject({ progress: 0, workouts: 0 });
  });

  it('counts days trained, against a goal of at least three', () => {
    const week = [session('2026-10-27', [lift('Row', 50)]), session('2026-10-27', [lift('Curl', 10)]), session('2026-10-29', [lift('Row', 50)])];
    expect(periodStats(week, 'week', 1, TODAY)).toMatchObject({ workouts: 2, consistency: 67 });
    expect(periodStats(week, 'week', 4, TODAY).consistency).toBe(50);
  });

  it('curves progress points, so small gains count and only big ones reach the top', () => {
    const score = (weight: number) => periodStats([...history('Bench', 100), session('2026-10-27', [lift('Bench', weight)])], 'week', 3, TODAY).score;
    // Consistency is one day of three: 33. Progress +25% is 100 points, +6.25% is 50.
    expect(score(125)).toBe(Math.round((100 + 33) / 2));
    expect(score(106.25)).toBe(Math.round((50 + 33) / 2));
  });

  it('ignores timed work, missing or impossible weights, and the future', () => {
    const stats = periodStats([
      ...history('Bench', 100),
      session('2026-10-27', [{ ...lift('Bike', null), kind: 'time', minutes: 20 }, lift('Bench', null), lift('Bench', 5000)]),
      session('2026-11-05', [lift('Bench', 150)]),
    ], 'week', 3, TODAY);
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

  it('earns a shield every four weeks, which saves the streak from one missed week', () => {
    const fourWeeks = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'].flatMap((monday) => week(monday, 3));
    // 2026-10-26 missed, and today is in the week after it.
    expect(weekStreak(fourWeeks, 3, '2026-11-03')).toEqual({ current: 4, best: 4, shields: 0 });
    expect(weekStreak(week('2026-09-28', 3), 3, '2026-10-13').current).toBe(0);
  });

  it('judges each week by the goal it had', () => {
    // Ali trained 2 days a week on a goal of 4, then lowered it to 2 from 2026-10-26.
    const goals: GoalChange[] = [{ from: '2000-01-03', goal: 4 }, { from: '2026-10-26', goal: 2 }];
    const dates = [...week('2026-10-12', 2), ...week('2026-10-19', 2), ...week('2026-10-26', 2)];
    expect(weekStreak(dates, goals, '2026-10-30')).toMatchObject({ current: 1, best: 1 });
  });

  it('counts two sessions on one day once', () => {
    expect(weekStreak(['2026-10-26', '2026-10-26', '2026-10-27'], 3, '2026-10-30').current).toBe(0);
  });
});

describe('goalIn', () => {
  it('uses the goal a week started with', () => {
    const goals: GoalChange[] = [{ from: '2000-01-03', goal: 4 }, { from: '2026-11-02', goal: 2 }];
    expect(goalIn(goals, '2026-11-01')).toBe(4);
    expect(goalIn(goals, '2026-11-02')).toBe(2);
    expect(goalIn(3, '2026-11-02')).toBe(3);
  });
});

describe('changeGoal', () => {
  // Sunday 2026-11-01. Next Monday is 2026-11-02.
  const SUNDAY = '2026-11-01';

  it('starts a new goal next Monday, keeping the old one until then', () => {
    const goals = changeGoal({ weeklyTarget: 4, goalHistory: [] }, 2, SUNDAY, true);
    expect(goals).toEqual([{ from: '2000-01-03', goal: 4 }, { from: '2026-11-02', goal: 2 }]);
    expect(goalIn(goals, SUNDAY)).toBe(4);
    expect(goalIn(goals, '2026-11-02')).toBe(2);
  });

  it('replaces a change that hasn’t started yet', () => {
    const once = changeGoal({ weeklyTarget: 4, goalHistory: [] }, 2, SUNDAY, true);
    expect(changeGoal({ weeklyTarget: 2, goalHistory: once }, 5, SUNDAY, true).map((change) => change.goal)).toEqual([4, 5]);
  });

  it('applies straight away for someone who hasn’t trained yet', () => {
    expect(changeGoal({ weeklyTarget: 4, goalHistory: [] }, 2, SUNDAY, false)).toEqual([]);
  });
});

describe('weekBonuses', () => {
  const lift = (weight: number): Entry => ({ id: 'b', name: 'Bench', kind: 'strength', sets: 3, reps: 8, weight, perSide: false, rpe: null, minutes: null, note: '' });
  const trained = (dates: string[], weight = 50) => dates.map((date) => ({ date, entries: [lift(weight)] }));
  const week = (monday: string, count: number) => Array.from({ length: count }, (_, day) => {
    const date = new Date(`${monday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day);
    return date.toISOString().slice(0, 10);
  });
  const TODAY = '2026-10-30';

  it('pays a streak more the longer it runs and the bigger the goal', () => {
    expect(streakBonus(1, 3)).toBe(0);
    expect(streakBonus(2, 3)).toBe(1);
    expect(streakBonus(4, 3)).toBe(3);
    expect(streakBonus(12, 3)).toBe(6);
    expect(streakBonus(4, 4)).toBe(4);
  });

  it('pays a comeback after a missed week, but not to someone brand new', () => {
    const comeback = trained([...week('2026-10-12', 3), ...week('2026-10-26', 3)]);
    expect(weekBonuses(comeback, 3, TODAY).comeback).toBe(3);
    expect(weekBonuses(trained(week('2026-10-26', 3)), 3, TODAY).comeback).toBe(0);
  });

  it('pays for more days than the goal', () => {
    expect(weekBonuses(trained(week('2026-10-26', 4)), 3, TODAY).overGoal).toBe(2);
    expect(weekBonuses(trained(week('2026-10-26', 3)), 3, TODAY).overGoal).toBe(0);
  });

  it('pays for beating an all-time best with some history behind it', () => {
    const history = trained(['2026-10-13', '2026-10-20']);
    expect(weekBonuses([...history, ...trained(['2026-10-27'], 55)], 3, TODAY).newBests).toBe(2);
    expect(weekBonuses([...trained(['2026-10-20']), ...trained(['2026-10-27'], 55)], 3, TODAY).newBests).toBe(0);
    // Bench twice in one session is still one session behind it.
    const twice = { date: '2026-10-20', entries: [lift(50), lift(50)] };
    expect(weekBonuses([twice, ...trained(['2026-10-27'], 55)], 3, TODAY).newBests).toBe(0);
  });

  it('caps the total', () => {
    const long = trained(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']
      .flatMap((monday) => week(monday, 4)));
    const threeLifts = (date: string, weight: number) => ({ date, entries: ['Bench', 'Squat', 'Row'].map((name) => ({ ...lift(weight), id: name, name })) });
    const history = long.map((workout) => threeLifts(workout.date, 50));
    const bonuses = weekBonuses([...history, ...week('2026-10-26', 5).map((date) => threeLifts(date, 60))], 4, TODAY);
    expect(bonuses.streak + bonuses.overGoal + bonuses.newBests).toBeGreaterThan(15);
    expect(bonuses.total).toBe(15);
  });
});

describe('beatABest', () => {
  const workout = (date: string, weight: number, reps = 8): ScoringWorkout => ({
    date, entries: [{ id: 'curl', name: 'Curl', kind: 'strength', sets: 3, reps, weight, perSide: false, rpe: null, minutes: null, note: '' }],
  });

  it('needs an earlier number to beat', () => {
    expect(beatABest([workout('2026-10-01', 50)])).toBe(false);
    expect(beatABest([workout('2026-10-02', 40), workout('2026-10-01', 50)])).toBe(false);
    expect(beatABest([workout('2026-10-01', 50), workout('2026-10-02', 52.5)])).toBe(true);
  });

  it('counts more reps at the same weight as a best', () => {
    expect(beatABest([workout('2026-10-01', 50, 8), workout('2026-10-02', 50, 10)])).toBe(true);
  });
});

describe('allTimeScore', () => {
  const squat = (weight: number): Entry => ({ id: 's', name: 'Squat', kind: 'strength', sets: 3, reps: 5, weight, perSide: false, rpe: null, minutes: null, note: '' });
  const days = (dates: string[], weight = 100): ScoringWorkout[] => dates.map((date) => ({ date, entries: [squat(weight)] }));
  const lastWeek = days(['2026-10-19', '2026-10-21', '2026-10-23']);
  const thisWeek = days(['2026-10-26', '2026-10-28'], 105);
  const none = new Map<string, number>();

  it('adds up each week as it stood on its Sunday', () => {
    const both = [...lastWeek, ...thisWeek];
    expect(allTimeScore(both, 3, TODAY, none)).toBe(weekScore(lastWeek, 3, '2026-10-25', 0) + weekScore(both, 3, TODAY, 0));
  });

  it('is nothing without a workout or a call', () => {
    expect(allTimeScore([], 3, TODAY, none)).toBe(0);
  });

  it('counts a week of calls before the first workout', () => {
    expect(allTimeScore([], 3, TODAY, new Map([['2026-10-19', 5]]))).toBe(5);
  });

  it('never lets a bad week take points away', () => {
    expect(allTimeScore(lastWeek, 3, TODAY, new Map([['2026-10-26', -10]]))).toBe(weekScore(lastWeek, 3, '2026-10-25', 0));
  });
});
