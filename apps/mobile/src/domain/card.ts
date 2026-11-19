import { bestSet, exerciseKey, kmText, voice, muscleLoad, setsOf, newPbOf, runTime, trainedDates, weekStreak, type LoggedWorkout, type Muscle, type Goals, type Run } from '@sandbag/shared';
import { formatMonth, num, toIsoDate, today } from './format';
import { bestBefore, buildHistory, metricOf, volumeOf, type ExerciseHistory } from './history';
import { pace, speed } from './runs';

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
    facts: [{ value: runTime(run.seconds), label: 'TIME' }, run.activity === 'run' ? { value: pace(run).replace(' /km', ''), label: 'MIN/KM' } : { value: speed(run), label: 'KM/H' }],
    lines: [],
    bests: race ? [`${race.name} PB`] : [],
    load: null,
  };
}

const LIFTS_SHOWN = 8;

/**
 * A month looked back on, as a card like any other. `workouts` is everything logged, since a new best
 * only means something against what came before the month began.
 */
export function wrappedCard(month: string, workouts: LoggedWorkout[], runs: Run[]): CardData {
  const sessions = workouts.filter((workout) => workout.date.startsWith(month));
  const walked = runs.filter((run) => run.date.startsWith(month));
  const moved = sessions.reduce((sum, workout) => sum + volumeOf(workout), 0);
  const km = walked.reduce((sum, run) => sum + run.distanceKm, 0);
  const sets = sessions.reduce((sum, workout) => sum + workout.entries.reduce((count, entry) => count + (entry.kind === 'strength' ? setsOf(entry).length : 0), 0), 0);

  // Each lift's best of the month, and how many days it was done.
  const lifts = new Map<string, { name: string; days: Set<string>; best: LoggedWorkout['entries'][number] }>();
  for (const workout of sessions) {
    for (const entry of workout.entries) {
      const key = exerciseKey(entry.name);
      const seen = lifts.get(key) ?? { name: entry.name, days: new Set<string>(), best: entry };
      seen.days.add(workout.date);
      if ((metricOf(entry) ?? -1) > (metricOf(seen.best) ?? -1)) seen.best = entry;
      lifts.set(key, seen);
    }
  }
  const ranked = [...lifts.values()].sort((a, b) => b.days.size - a.days.size || (metricOf(b.best) ?? 0) - (metricOf(a.best) ?? 0));
  const index = buildHistory(workouts);
  const bests = ranked.filter((lift) => {
    const value = metricOf(lift.best);
    const before = bestBefore(index, lift.name, `${month}-01`);
    return value !== null && before !== null && value > before;
  }).map((lift) => lift.name);

  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const lastDay = toIsoDate(new Date(year, monthNumber, 0));
  return {
    title: `${formatMonth(`${month}-01`).split(' ')[0]} wrapped`,
    date: lastDay < today() ? lastDay : today(),
    headline: moved ? { value: kilos(moved), label: 'KG MOVED' } : { value: String(sessions.length), label: sessions.length === 1 ? 'SESSION' : 'SESSIONS' },
    quip: moved ? voice.lifted(moved) : null,
    facts: [
      ...(moved ? [{ value: String(sessions.length), label: sessions.length === 1 ? 'SESSION' : 'SESSIONS' }] : []),
      ...(sets ? [{ value: String(sets), label: setWord(sets) }] : []),
      ...(km ? [{ value: kmText(km).replace(' km', ''), label: 'KM ON FOOT' }] : []),
    ],
    lines: ranked.slice(0, LIFTS_SHOWN).map((lift) => ({ name: lift.name, value: `${topSet(lift.best)} · ${lift.days.size}×` })),
    bests,
    load: muscleLoad(sessions.flatMap((workout) => workout.entries)),
  };
}
