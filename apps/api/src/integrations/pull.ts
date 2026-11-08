import { addDays, dateIn, type IntegrationId } from '@sandbag/shared';
import { and, asc, eq, gte, isNotNull, lt, ne, notInArray, or, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { integrationImports, integrations } from '../db/schema';
import { openKey } from './sealing';

/** One workout as a provider sent it, with what's needed to file it. */
export interface PulledWorkout {
  externalId: string;
  performedAt: Date;
  payload: unknown;
}

/** The provider said no to the key: wrong, revoked, or replaced by a newer one. */
export class BadKey extends Error {}

/** How the worker talks to one provider. The rest of importing is the same for all of them. */
export interface Fetcher {
  /** Workouts done on or after that day (UTC), or the whole history when it's null. Throws BadKey for a key that's refused. */
  fetchWorkouts(key: string, since: string | null): Promise<PulledWorkout[]>;
}

/** How long each account rests between pulls. */
export const PULL_EVERY_MS = 15 * 60_000;
/** Each pull looks this far back, so edits and deletions there come through. */
export const RECHECK_DAYS = 14;
const BATCH = 20;

type Due = Pick<typeof integrations.$inferSelect, 'userId' | 'provider' | 'sealedKey' | 'syncedAt'>;

const ofAccount = (account: Due) => and(eq(integrations.userId, account.userId), eq(integrations.provider, account.provider));
const ofInbox = (account: Due) => and(eq(integrationImports.userId, account.userId), eq(integrationImports.provider, account.provider));

async function pullOne(db: Db, privateKey: string, fetcher: Fetcher, account: Due, now: Date): Promise<void> {
  // The first pull takes the whole history. After that, a window that catches changes.
  const since = account.syncedAt ? addDays(dateIn(null, now), -RECHECK_DAYS) : null;
  let workouts: PulledWorkout[];
  try {
    workouts = await fetcher.fetchWorkouts(openKey(privateKey, account.sealedKey), since);
  } catch (error) {
    await db.update(integrations).set({ status: error instanceof BadKey ? 'bad_key' : 'failing', checkedAt: now }).where(ofAccount(account));
    if (!(error instanceof BadKey)) throw error;
    return;
  }
  for (const workout of workouts) {
    const row = { userId: account.userId, provider: account.provider, externalId: workout.externalId, performedAt: workout.performedAt, payload: workout.payload, fetchedAt: now, importedAt: null };
    // Unchanged ones are left alone, so the API only redoes what changed.
    await db.insert(integrationImports).values(row).onConflictDoUpdate({
      target: [integrationImports.userId, integrationImports.provider, integrationImports.externalId],
      set: { performedAt: row.performedAt, payload: row.payload, fetchedAt: now, importedAt: null },
      setWhere: sql`${integrationImports.payload} is distinct from excluded.payload`,
    });
  }
  if (since) {
    // In the window but no longer listed: deleted there.
    const listed = workouts.map((workout) => workout.externalId);
    await db.update(integrationImports).set({ payload: null, fetchedAt: now, importedAt: null }).where(and(
      ofInbox(account),
      gte(integrationImports.performedAt, new Date(`${since}T00:00:00Z`)),
      isNotNull(integrationImports.payload),
      ...(listed.length ? [notInArray(integrationImports.externalId, listed)] : []),
    ));
  }
  await db.update(integrations).set({ status: 'ok', syncedAt: now, checkedAt: now }).where(ofAccount(account));
}

/**
 * Pulls every account that's due into the inbox, a few at a time. A refused key waits until it's connected again.
 * One provider failing doesn't stop the others: its error goes to onError and the round carries on.
 */
export async function pullDue(
  db: Db, privateKey: string, fetchers: Record<IntegrationId, Fetcher>, onError: (error: unknown) => void, now = new Date(),
): Promise<number> {
  const due = await db.select({ userId: integrations.userId, provider: integrations.provider, sealedKey: integrations.sealedKey, syncedAt: integrations.syncedAt })
    .from(integrations)
    .where(and(ne(integrations.status, 'bad_key'), or(isNull(integrations.checkedAt), lt(integrations.checkedAt, new Date(now.getTime() - PULL_EVERY_MS)))))
    .orderBy(sql`${integrations.checkedAt} asc nulls first`, asc(integrations.userId))
    .limit(BATCH);
  for (const account of due) {
    try {
      await pullOne(db, privateKey, fetchers[account.provider], account, now);
    } catch (error) {
      onError(error);
    }
  }
  return due.length;
}
