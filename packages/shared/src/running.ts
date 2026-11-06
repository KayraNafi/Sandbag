import type { Activity, Run } from './schemas';
import { mondayOf } from './time';

/**
 * Running is scored apart from the gym. It has no goal, no streak and no consistency: people run when
 * there's a race or a long run, not on a schedule. It pays when it happens, for the distance and for the
 * pace, and unlike lifting the pace is scored as it is, not against your own history.
 */
export type ScoringRun = Pick<Run, 'date' | 'activity' | 'distanceKm' | 'seconds'>;
/** What one run is, whatever day it was. */
type Effort = Pick<Run, 'activity' | 'distanceKm' | 'seconds'>;

/** Riegel's exponent: how much slower the same effort runs over a longer distance. */
const FATIGUE = 1.06;
/** A little under the 5k world record. Scaled by Riegel it stays under the record at every distance, the marathon included. */
const RECORD_5K_SECONDS = 740;
/** Faster than race walkers go. Past it a walk was a run, or a typo. */
const MAX_WALK_KMH = 16;

/** Every kilometre pays, and running pays double. */
const POINTS_PER_KM: Record<Activity, number> = { run: 1, walk: 0.5 };
/** Above a marathon, so the biggest race of the year is paid in full, and below what a mileage grind could bury the lifters with. */
export const MAX_WEEK_DISTANCE_POINTS = 60;
/** Every run pays for its pace, up to this much a week, so a pile of short fast runs can't stack up. */
export const MAX_WEEK_PACE_POINTS = 20;
/** Shorter than this, a 5k time worked out from it is a guess. */
const PACE_MIN_KM = 2;
/** What a run's pace pays, by the 5k time it's worth, fastest first. Slower than the last pays nothing. */
const PACE_TIERS: readonly { underSeconds: number; points: number }[] = [
  { underSeconds: 20 * 60, points: 10 },
  { underSeconds: 22.5 * 60, points: 8 },
  { underSeconds: 25 * 60, points: 6 },
  { underSeconds: 27.5 * 60, points: 4 },
  { underSeconds: 30 * 60, points: 2 },
];

/** Seconds the same effort would take over another distance, by Riegel's formula. */
const equivalentSeconds = (run: Pick<Run, 'distanceKm' | 'seconds'>, km: number) => run.seconds * (km / run.distanceKm) ** FATIGUE;

/** Whether a run or walk could have happened. Nobody real is ever doubted: the line is the world record. */
export function believable(run: Effort): boolean {
  if (run.activity === 'walk') return run.distanceKm / (run.seconds / 3600) <= MAX_WALK_KMH;
  return run.seconds >= RECORD_5K_SECONDS * (run.distanceKm / 5) ** FATIGUE;
}

/** One run's distance points, before the week's cap. */
export const distancePoints = (run: Effort) => (believable(run) ? run.distanceKm * POINTS_PER_KM[run.activity] : 0);

/**
 * One run's pace points, before the week's cap. Every run is worked out as the 5k it's worth, so a
 * marathon at 5:00 a km scores far above a 5k at the same pace. Walks don't score pace.
 */
export function pacePoints(run: Effort): number {
  if (run.activity !== 'run' || run.distanceKm < PACE_MIN_KM || !believable(run)) return 0;
  const fiveK = equivalentSeconds(run, 5);
  return PACE_TIERS.find((tier) => fiveK < tier.underSeconds)?.points ?? 0;
}

export interface RunningStats {
  /** Every believable kilometre in the period, run or walked. */
  km: number;
  distance: number;
  pace: number;
  /** Distance and pace together, as they go on the score. */
  points: number;
}

/** Running points up to a date, from a date or from the first run, with each Monday-to-Sunday week capped on its own. */
export function runningStats(runs: ScoringRun[], from: string | null, to: string): RunningStats {
  const weeks = new Map<string, { distance: number; pace: number }>();
  let km = 0;
  for (const run of runs) {
    if ((from !== null && run.date < from) || run.date > to || !believable(run)) continue;
    km += run.distanceKm;
    const week = weeks.get(mondayOf(run.date)) ?? { distance: 0, pace: 0 };
    weeks.set(mondayOf(run.date), { distance: week.distance + distancePoints(run), pace: week.pace + pacePoints(run) });
  }
  let distance = 0;
  let pace = 0;
  for (const week of weeks.values()) {
    distance += Math.min(MAX_WEEK_DISTANCE_POINTS, Math.round(week.distance));
    pace += Math.min(MAX_WEEK_PACE_POINTS, week.pace);
  }
  return { km: Math.round(km * 10) / 10, distance, pace, points: distance + pace };
}

/** Running points for the week so far. */
export const weekRunning = (runs: ScoringRun[], today: string) => runningStats(runs, mondayOf(today), today);

const pad = (value: number) => String(value).padStart(2, '0');

/** A time as a race clock shows it: 52:30, or 3:05:12 past the hour. */
export function runTime(seconds: number): string {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return hours ? `${hours}:${pad(minutes)}:${pad(whole % 60)}` : `${minutes}:${pad(whole % 60)}`;
}

/** Kilometres without trailing zeros: 5, 10.5, 42.2. */
export const kmText = (distanceKm: number) => `${Math.round(distanceKm * 100) / 100} km`;

/** What a run was, in a few words: "Ran 10 km in 52:30". */
export const runHeadline = (run: Effort) => `${run.activity === 'run' ? 'Ran' : 'Walked'} ${kmText(run.distanceKm)} in ${runTime(run.seconds)}`;

/** The race distances a PB is kept for. PBs are for reference and bragging: they score nothing. */
const PB_DISTANCES = [
  { name: '5k', km: 5 },
  { name: '10k', km: 10 },
  { name: 'Half marathon', km: 21.0975 },
  { name: 'Marathon', km: 42.195 },
] as const;
export type PbDistance = (typeof PB_DISTANCES)[number];
/** How far off a race distance a run can be and still count for it, for a watch that measured a little long or short. */
const PB_MARGIN = 0.03;

/** The race distance a run counts for, if it's a believable run at one. */
export function pbDistanceOf(run: Effort): PbDistance | undefined {
  if (run.activity !== 'run' || !believable(run)) return undefined;
  return PB_DISTANCES.find((race) => Math.abs(run.distanceKm - race.km) <= race.km * PB_MARGIN);
}

/** The fastest run at a race distance, or null when there's none. */
export function personalBest<T extends Effort>(runs: T[], race: PbDistance): T | null {
  return runs
    .filter((run) => pbDistanceOf(run) === race)
    .reduce<T | null>((best, run) => (!best || run.seconds < best.seconds ? run : best), null);
}

/** The race this run set a new PB at, beating an earlier one. A first run at a distance has nothing to beat. */
export function newPbOf(run: Effort, others: Effort[]): PbDistance | null {
  const race = pbDistanceOf(run);
  const best = race ? personalBest(others, race) : null;
  return race && best && run.seconds < best.seconds ? race : null;
}
