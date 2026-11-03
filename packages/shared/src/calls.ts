import type { Entry } from './schemas';
import { exerciseKey } from './scoring';

export const DAY_MS = 86_400_000;

/**
 * open: waiting on their next session of the lift.
 * watching: missed by a little at full effort, so it isn't held against them yet.
 * cleared, failed, honest and caught are final, apart from the corrections in the API.
 */
export type CallStatus = 'open' | 'watching' | 'cleared' | 'failed' | 'honest' | 'caught';
/** Still waiting on something: a session, or the watch running out. */
export const LIVE_CALLS: CallStatus[] = ['open', 'watching'];

/** Days to answer a call before it counts as failed. */
export const CALL_DAYS = 14;
/** Days an honest miss is watched before it's believed. */
export const WATCH_DAYS = 14;
/** Only recent posts can be called, so nobody is held to a number from months ago. */
export const CALLABLE_DAYS = 14;
/** Open calls one person can have out at a time. */
export const MAX_OPEN_CALLS = 3;
/** How long after a failed verdict its session can be edited to fix a typo, once. */
export const CORRECTION_MS = DAY_MS;
/** How close a miss has to be, and how hard it has to feel, to be an honest miss. */
export const HONEST_MARGIN = 0.05;
export const HONEST_RPE = 9;
export const SANDBAG_BADGE_DAYS = 7;

/** Points for each side once a call is settled. Calling isn't free: being wrong costs the caller. */
export const CALL_POINTS: Record<CallStatus, { target: number; caller: number }> = {
  open: { target: 0, caller: 0 },
  watching: { target: 0, caller: 0 },
  honest: { target: 0, caller: 0 },
  cleared: { target: 5, caller: -3 },
  failed: { target: -5, caller: 5 },
  caught: { target: -10, caller: 10 },
};

/**
 * Estimated one-rep max, so more reps at the same weight counts as stronger.
 * Past 12 reps the estimate stops meaning much, so reps beyond that add nothing.
 */
export function estimatedMax(weight: number, reps: number | null): number {
  const counted = Math.min(Math.max(reps ?? 1, 1), 12);
  return weight * (1 + (counted - 1) / 30);
}

/** The most reps any set of an entry reached. */
export function topReps(entry: Pick<Entry, 'reps' | 'setReps'>): number | null {
  return Math.max(entry.reps ?? 0, ...(entry.setReps ?? []).map((value) => value ?? 0)) || null;
}

/** The best set of an entry: its weight for its top reps. */
export function entryMax(entry: Pick<Entry, 'weight' | 'reps' | 'setReps'>): number | null {
  return entry.weight === null ? null : estimatedMax(entry.weight, topReps(entry));
}

export interface LiftResult {
  max: number;
  rpe: number | null;
}

/** How a session did on one lift, or null when it didn't do that lift with a weight. */
export function liftIn(entries: Entry[], key: string): LiftResult | null {
  let best: LiftResult | null = null;
  for (const entry of entries) {
    if (entry.kind !== 'strength' || exerciseKey(entry.name) !== key) continue;
    const max = entryMax(entry);
    if (max !== null && (!best || max > best.max)) best = { max, rpe: entry.rpe };
  }
  return best;
}

/** Beat it and it's cleared. Just short at your limit, and you get the benefit of the doubt for now. */
export function judgeCall(targetMax: number, lift: LiftResult): 'cleared' | 'failed' | 'watching' {
  if (lift.max > targetMax) return 'cleared';
  const close = lift.max >= targetMax * (1 - HONEST_MARGIN);
  return close && lift.rpe !== null && lift.rpe >= HONEST_RPE ? 'watching' : 'failed';
}

/** A watched miss followed by this much more was never a limit. */
export function exposesSandbag(targetMax: number, lift: LiftResult): boolean {
  return lift.max >= targetMax * (1 + HONEST_MARGIN);
}
