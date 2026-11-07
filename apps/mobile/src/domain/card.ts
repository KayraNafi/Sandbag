import { bestSet, voice, muscleLoad, setsOf, newPbOf, runTime, trainedDates, weekStreak, type LoggedWorkout, type Muscle, type Goals, type Run } from '@sandbag/shared';
import { num } from './format';
import { bestBefore, metricOf, volumeOf, type ExerciseHistory } from './history';
import { pace } from './runs';

/** One number with what it counts. */
export interface CardStat {
  value: string;
  label: string;
}

/** What a share card prints, the same for a session and a run, so every look can show either. */
export interface CardData {
  title: string;
  date: string;
  /** The one number the card is about: kilos moved, sets done, or distance. */
  headline: CardStat;
  /** A line about the headline, when there's one to say. */
  quip: string | null;
  /** A few more numbers, smaller. */
  facts: CardStat[];
  /** Each lift with its top set. A run has nothing to itemise, so its facts stand in. */
  lines: { name: string; value: string }[];
  /** What's new on the record: lifts with a new best, or the race a run set a PB at. */
  bests: string[];
  /** How hard each muscle was worked. Absent for a run, which has no honest map. */
  load: Partial<Record<Muscle, number>> | null;
}

const kilos = (value: number) => value.toLocaleString('en-US');
const setWord = (sets: number) => (sets === 1 ? 'SET' : 'SETS');

/** Lifts that beat everything logged before this session's day, with the old and new numbers. */
export function newBests(workout: LoggedWorkout, index: Map<string, ExerciseHistory>): { name: string; text: string }[] {
  return workout.entries.flatMap((entry) => {
    const value = metricOf(entry);
    const previous = bestBefore(index, entry.name, workout.date);
    return value !== null && previous !== null && value > previous
      ? [{ name: entry.name, text: `${num(previous)} → ${num(value)} ${entry.kind === 'time' ? 'min' : 'kg'}` }]
      : [];
  });
}

/** The streak as it stood on a day, so a card for an old session doesn't print today's. */
export function streakOn(workouts: LoggedWorkout[], goals: Goals, date: string): number {
  return weekStreak(trainedDates(workouts.filter((item) => item.date <= date)), goals, date).current;
}

function topSet(entry: LoggedWorkout['entries'][number]): string {
  if (entry.kind === 'time') return `${num(entry.minutes ?? 0)} min`;
  const best = bestSet(entry);
  if (best) return `${num(best.weight)} × ${best.reps ?? '–'}`;
  return `${entry.sets ?? 1} × ${entry.reps ?? '–'}`;
}

export function workoutCard(workout: LoggedWorkout, { index, streak }: { index: Map<string, ExerciseHistory>; streak: number }): CardData {
  const moved = volumeOf(workout);
  const sets = workout.entries.reduce((sum, entry) => sum + (entry.kind === 'strength' ? setsOf(entry).length : 0), 0);
  return {
    title: workout.title,
    date: workout.date,
    headline: moved ? { value: kilos(moved), label: 'KG MOVED' } : { value: String(sets), label: `${setWord(sets)} DONE` },
    quip: moved ? voice.lifted(moved) : null,
    facts: [
      ...(moved && sets ? [{ value: String(sets), label: setWord(sets) }] : []),
      ...(streak > 1 ? [{ value: String(streak), label: 'WEEKS' }] : []),
    ],
    lines: workout.entries.map((entry) => ({ name: entry.name, value: topSet(entry) })),
    bests: newBests(workout, index).map((best) => best.name),
    load: muscleLoad(workout.entries),
  };
}

export function runCard(run: Run, others: Run[]): CardData {
  const race = newPbOf(run, others.filter((other) => other.id !== run.id && other.date <= run.date));
  return {
    title: run.activity === 'run' ? 'Run' : 'Walk',
    date: run.date,
    headline: { value: num(run.distanceKm), label: 'KM' },
    quip: null,
    facts: [{ value: runTime(run.seconds), label: 'TIME' }, { value: pace(run).replace(' /km', ''), label: 'MIN/KM' }],
    lines: [],
    bests: race ? [`${race.name} PB`] : [],
    load: null,
  };
}
