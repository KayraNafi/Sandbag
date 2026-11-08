import { importedWorkoutId, INTEGRATIONS, loggedWorkoutSchema, type LoggedWorkout } from '@sandbag/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { lockUser, type Db, type Tx } from '../db/client';
import { integrationImports, integrations, loggedWorkouts, users } from '../db/schema';
import { notifyOvertaken, weekScores } from '../modules/rankings';
import { awardTrophies } from '../modules/trophies';
import { saveLogged } from '../modules/workouts';

const BATCH = 100;
const POLL_MS = 15_000;

type Pending = {
  row: typeof integrationImports.$inferSelect;
  settings: unknown;
  user: Pick<typeof users.$inferSelect, 'id' | 'displayName' | 'timeZone' | 'weeklyTarget' | 'goalHistory'>;
};

/** The session a workout from the inbox should be now: a new copy, nothing, or the old one deleted. */
function sessionFor({ row, settings, user }: Pending, existing: LoggedWorkout | undefined): LoggedWorkout | null {
  const provider = INTEGRATIONS[row.provider];
  const parsedSettings = provider?.settingsSchema.safeParse(settings);
  const made = provider && parsedSettings?.success && row.payload !== null
    ? provider.toWorkout(row.payload, parsedSettings.data, user.timeZone)
    : null;
  const updatedAt = Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1);
  // Checked like anything a phone sends, so a provider can't put in what the app couldn't.
  const checked = made && loggedWorkoutSchema.safeParse({ ...made, id: importedWorkoutId(row.provider, row.externalId), updatedAt });
  if (checked?.success) return checked.data;
  return existing && !existing.deleted ? { ...existing, deleted: true, updatedAt } : null;
}

async function importFor(tx: Tx, user: Pending['user'], pending: Pending[]): Promise<void> {
  await lockUser(tx, user.id);
  const ids = pending.map(({ row }) => importedWorkoutId(row.provider, row.externalId));
  const stored = await tx.select().from(loggedWorkouts).where(and(eq(loggedWorkouts.ownerId, user.id), inArray(loggedWorkouts.id, ids)));
  const byId = new Map(stored.map((row) => [row.id, row as LoggedWorkout]));
  const docs = pending.flatMap((item, index) => sessionFor(item, byId.get(ids[index]!)) ?? []);
  if (docs.length) {
    const before = await weekScores(tx, user.id);
    await saveLogged(tx, user, docs);
    await notifyOvertaken(tx, user, before);
    await awardTrophies(tx, user);
  }
  for (const { row } of pending) {
    // Only the copy that was read: one the worker replaced meanwhile waits for the next round.
    await tx.update(integrationImports).set({ importedAt: new Date() }).where(and(
      eq(integrationImports.userId, row.userId), eq(integrationImports.provider, row.provider),
      eq(integrationImports.externalId, row.externalId), eq(integrationImports.fetchedAt, row.fetchedAt),
    ));
  }
}

/** Turns what the import worker fetched into sessions, through the same save as the app's, so calls and rankings follow. */
export async function importPending(db: Db): Promise<number> {
  const pending = await db.select({
    row: integrationImports,
    settings: integrations.settings,
    user: { id: users.id, displayName: users.displayName, timeZone: users.timeZone, weeklyTarget: users.weeklyTarget, goalHistory: users.goalHistory },
  }).from(integrationImports)
    .innerJoin(integrations, and(eq(integrations.userId, integrationImports.userId), eq(integrations.provider, integrationImports.provider)))
    .innerJoin(users, eq(users.id, integrationImports.userId))
    .where(isNull(integrationImports.importedAt))
    .orderBy(asc(integrationImports.fetchedAt))
    .limit(BATCH);
  // One transaction a person, so each person's scores are compared before and after their own imports.
  const byUser = new Map<string, Pending[]>();
  for (const item of pending) byUser.set(item.user.id, [...(byUser.get(item.user.id) ?? []), item]);
  for (const items of byUser.values()) {
    await db.transaction((rawTx) => importFor(rawTx as unknown as Tx, items[0]!.user, items));
  }
  return pending.length;
}

/** Runs importPending every few seconds in the API, one round at a time. Returns a stop. */
export function startImporting(db: Db, onError: (error: unknown) => void): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    importPending(db).catch(onError).finally(() => { running = false; });
  }, POLL_MS);
  return () => clearInterval(timer);
}
