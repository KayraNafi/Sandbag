import type { LoggedWorkout, SavedWorkout } from '@sandbag/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { loggedWorkouts, savedWorkouts, syncSeq } from '../db/schema';
import { callsOnSave, expireCalls } from './calls';

const nextSeq = () => sql<number>`nextval(${syncSeq.seqName})`;

export const toLogged = (row: typeof loggedWorkouts.$inferSelect): LoggedWorkout => ({
  id: row.id, date: row.date, title: row.title, savedWorkoutId: row.savedWorkoutId, entries: row.entries, updatedAt: row.updatedAt, deleted: row.deleted,
});

export const toSaved = (row: typeof savedWorkouts.$inferSelect): SavedWorkout => ({
  id: row.id, name: row.name, position: row.position, exercises: row.exercises, savedFrom: row.savedFrom, updatedAt: row.updatedAt, deleted: row.deleted,
});

/** Last write wins on updatedAt. Returns the server copies that beat what was sent. */
export async function saveLogged(tx: Tx, user: { id: string; displayName: string }, docs: LoggedWorkout[]): Promise<{ rejected: LoggedWorkout[]; written: number }> {
  const rejected: LoggedWorkout[] = [];
  let written = 0;
  // Before anything is answered, so a session that comes in late can't answer a call that ran out.
  await expireCalls(tx);
  for (const doc of docs) {
    const [existing] = await tx.select().from(loggedWorkouts).where(and(eq(loggedWorkouts.ownerId, user.id), eq(loggedWorkouts.id, doc.id)));
    if (existing && existing.updatedAt >= doc.updatedAt) {
      if (existing.updatedAt > doc.updatedAt) rejected.push(toLogged(existing));
      continue;
    }
    const values = { ...doc, ownerId: user.id, seq: nextSeq() };
    await tx.insert(loggedWorkouts).values(values).onConflictDoUpdate({ target: [loggedWorkouts.ownerId, loggedWorkouts.id], set: values });
    written += 1;
    await callsOnSave(tx, user, existing ? toLogged(existing) : null, doc);
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
