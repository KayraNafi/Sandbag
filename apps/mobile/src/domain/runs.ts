import { distancePoints, kmText, pacePoints, pbDistanceOf, personalBest, runTime, type LoggedWorkout, type Run } from '@sandbag/shared';

/** Runs not deleted, newest first. */
export function activeRuns(runs: Record<string, Run>): Run[] {
  return Object.values(runs)
    .filter((run) => !run.deleted)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

/** Minutes per kilometre, the way runners say it: 5:15 /km. */
export const pace = (run: Pick<Run, 'distanceKm' | 'seconds'>) => `${runTime(run.seconds / run.distanceKm)} /km`;

/** What a run was, in one line: "10 km · 52:30 · 5:15 /km". */
export const runSummary = (run: Pick<Run, 'distanceKm' | 'seconds'>) => `${kmText(run.distanceKm)} · ${runTime(run.seconds)} · ${pace(run)}`;

export const runTitle = (run: Pick<Run, 'activity'>) => (run.activity === 'run' ? 'Run' : 'Walk');

/** Hours, minutes and seconds typed separately, as one count of seconds. Null until something is typed. */
export function toSeconds(parts: { hours: number | null; minutes: number | null; seconds: number | null }): number | null {
  const total = (parts.hours ?? 0) * 3600 + (parts.minutes ?? 0) * 60 + (parts.seconds ?? 0);
  return total > 0 ? Math.round(total) : null;
}

export function fromSeconds(total: number): { hours: number; minutes: number; seconds: number } {
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

/** One list of gym sessions and runs, newest first, as history and Recent show them. */
export type TimelineItem = { date: string; updatedAt: number } & ({ kind: 'workout'; workout: LoggedWorkout } | { kind: 'run'; run: Run });

export function timeline(workouts: LoggedWorkout[], runs: Run[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...workouts.map((workout) => ({ kind: 'workout' as const, date: workout.date, updatedAt: workout.updatedAt, workout })),
    ...runs.map((run) => ({ kind: 'run' as const, date: run.date, updatedAt: run.updatedAt, run })),
  ];
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

export type Effort = Pick<Run, 'activity' | 'distanceKm' | 'seconds'>;

/** What a run scores: points for the distance, and for a run, points for the pace. */
export const pointsLine = (run: Effort) => `+${Math.round(distancePoints(run))} for the distance${run.activity === 'run' ? `, +${pacePoints(run)} for the pace` : ''}`;

/** Where a run stands against the PB at its race distance among the others, if it's run at one. For reference: it scores nothing. */
export function pbLine(run: Effort, others: Run[]): string | null {
  const race = pbDistanceOf(run);
  if (!race) return null;
  const best = personalBest(others, race);
  if (!best) return `Your first ${race.name} on record. That’s the PB to beat.`;
  if (run.seconds < best.seconds) return `New ${race.name} PB, ${runTime(best.seconds - run.seconds)} faster than ${runTime(best.seconds)}.`;
  return `${race.name} PB: ${runTime(best.seconds)}.`;
}
