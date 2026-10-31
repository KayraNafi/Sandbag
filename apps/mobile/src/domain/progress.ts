import { metricOf, type ExerciseHistory } from './history';

export interface ProgressPoint {
  date: string;
  value: number;
}

export interface LiftProgress {
  key: string;
  name: string;
  unit: string;
  points: ProgressPoint[];
  first: number;
  latest: number;
  change: number;
}

/** One point per day, the day's best, using whichever kind the lift is logged as now. */
export function dailyPoints(history: ExerciseHistory): ProgressPoint[] {
  const timed = history.log.at(-1)?.kind === 'time';
  const best = new Map<string, number>();
  for (const item of history.log) {
    const value = metricOf(item);
    if (value !== null && (item.kind === 'time') === timed) best.set(item.date, Math.max(value, best.get(item.date) ?? 0));
  }
  return [...best].map(([date, value]) => ({ date, value }));
}

export function changePercent(first: number, latest: number): number {
  return first > 0 ? Math.round(((latest - first) / first) * 100) : 0;
}

/** Lifts with a trend to show, the ones you do most first. */
export function liftProgress(index: Map<string, ExerciseHistory>): LiftProgress[] {
  const lifts: LiftProgress[] = [];
  for (const history of index.values()) {
    const points = dailyPoints(history);
    const first = points[0]?.value;
    const latest = points.at(-1)?.value;
    if (points.length < 2 || first === undefined || latest === undefined) continue;
    lifts.push({
      key: history.key, name: history.name, unit: history.log.at(-1)?.kind === 'time' ? 'min' : 'kg',
      points, first, latest, change: changePercent(first, latest),
    });
  }
  return lifts.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));
}
