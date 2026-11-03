import { entryMax, entrySetup, exerciseKey, type Entry, type LoggedWorkout, type SavedWorkout } from '@sandbag/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { loggedWorkouts, savedWorkouts, syncSeq } from '../db/schema';
import { badRequest } from '../errors';
import { reopenCalls, settleCalls } from './calls';

const nextSeq = () => sql<number>`nextval(${syncSeq.seqName})`;

export const toLogged = (row: typeof loggedWorkouts.$inferSelect): LoggedWorkout => ({
  durationSeconds: row.durationSeconds, id: row.id, date: row.date, title: row.title, savedWorkoutId: row.savedWorkoutId, entries: row.entries, updatedAt: row.updatedAt, deleted: row.deleted,
});

export const toSaved = (row: typeof savedWorkouts.$inferSelect): SavedWorkout => ({
  id: row.id, name: row.name, position: row.position, exercises: row.exercises, savedFrom: row.savedFrom, updatedAt: row.updatedAt, deleted: row.deleted,
});

export function assertNotFuture(date: string): void {
  // A day ahead is someone in a later time zone. More than that is a typo or a cheat.
  if (Date.parse(`${date}T00:00:00Z`) > Date.now() + 2 * 86_400_000) throw badRequest(`${date} is in the future`);
}

/** Only what scoring reads. The database reorders JSON keys, so the raw text can't be compared. */
const numbersOf = (entries: Entry[]) => JSON.stringify(entries.map((entry) => [exerciseKey(entry.name), entryMax(entry), entrySetup(entry), entry.minutes]));

/** Last write wins on updatedAt. Returns the server copies that beat what was sent. */
export async function saveLogged(tx: Tx, user: { id: string; displayName: string }, docs: LoggedWorkout[]): Promise<{ rejected: LoggedWorkout[]; written: number }> {
  const rejected: LoggedWorkout[] = [];
  let written = 0;
  for (const doc of docs) {
    const [existing] = await tx.select().from(loggedWorkouts).where(and(eq(loggedWorkouts.ownerId, user.id), eq(loggedWorkouts.id, doc.id)));
    if (existing && existing.updatedAt >= doc.updatedAt) {
      if (existing.updatedAt > doc.updatedAt) rejected.push(toLogged(existing));
      continue;
    }
    const unchanged = existing && existing.date === doc.date && numbersOf(existing.entries) === numbersOf(doc.entries);
    const values = { ...doc, ownerId: user.id, seq: nextSeq(), recordedAt: unchanged ? existing.recordedAt : new Date() };
    await tx.insert(loggedWorkouts).values(values).onConflictDoUpdate({ target: [loggedWorkouts.ownerId, loggedWorkouts.id], set: values });
    written += 1;
    // A verdict has to stay true, so changing the number behind it looks at the call again.
    if (existing && !existing.deleted && (doc.deleted || !unchanged)) await reopenCalls(tx, user, doc);
    if (!existing || !unchanged) await settleCalls(tx, user, doc);
  }
  return { rejected, written };
}

export async function saveSaved(tx: Tx, userId: string, docs: SavedWorkout[]): Promise<SavedWorkout[]> {
  const rejected: SavedWorkout[] = [];
  for (const doc of docs) {
    const [existing] = await tx.select().from(savedWorkouts).where(and(eq(savedWorkouts.ownerId, userId), eq(savedWorkouts.id, doc.id)));
    if (existing && existing.updatedAt >= doc.updatedAt) {
      if (existing.updatedAt > doc.updatedAt) rejected.push(toSaved(existing));
      continue;
    }
    const values = { ...doc, ownerId: userId, seq: nextSeq() };
    await tx.insert(savedWorkouts).values(values).onConflictDoUpdate({ target: [savedWorkouts.ownerId, savedWorkouts.id], set: values });
  }
  return rejected;
}
