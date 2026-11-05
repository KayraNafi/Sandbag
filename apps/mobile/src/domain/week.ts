import { goalIn, goalsOf, mondayOf, trainedDates, weekStreak, type LoggedWorkout } from '@sandbag/shared';
import { useMemo } from 'react';
import { useSession } from '@/auth/session';
import { today as todayIso } from './format';

/** This week against the goal: the days trained, this week's goal, and the streak. */
export function useWeek(workouts: LoggedWorkout[]) {
  const me = useSession((state) => state.me);
  const today = todayIso();
  const dates = useMemo(() => trainedDates(workouts), [workouts]);
  const goals = me ? goalsOf(me) : 3;
  const streak = useMemo(() => weekStreak(dates, goals, today), [dates, goals, today]);
  return {
    today,
    dates,
    days: dates.filter((date) => date >= mondayOf(today) && date <= today).length,
    // A new goal can wait for next Monday, so this week's may not be the one in settings.
    goal: goalIn(goals, today),
    streak,
  };
}
