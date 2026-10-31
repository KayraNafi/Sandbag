import {
  exerciseKey, resolveCall, SANDBAG_BADGE_DAYS, voice,
  type LoggedWorkout, type SavedWorkout,
} from '@sandbag/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { loggedWorkouts, sandbagCalls, savedWorkouts, syncSeq, users } from '../db/schema';
import { notify } from './notifications';

const nextSeq = () => sql<number>`nextval(${syncSeq.seqName})`;

export const toLogged = (row: typeof loggedWorkouts.$inferSelect): LoggedWorkout => ({
  id: row.id, date: row.date, title: row.title, savedWorkoutId: row.savedWorkoutId, entries: row.entries, updatedAt: row.updatedAt, deleted: row.deleted,
});

export const toSaved = (row: typeof savedWorkouts.$inferSelect): SavedWorkout => ({
  id: row.id, name: row.name, position: row.position, exercises: row.exercises, savedFrom: row.savedFrom, updatedAt: row.updatedAt, deleted: row.deleted,
});

/** A sandbag call is settled by the next logged session of that lift. */
async function settleCalls(tx: Tx, user: { id: string; displayName: string }, workout: LoggedWorkout): Promise<void> {
  if (workout.deleted) return;
  const open = await tx.select().from(sandbagCalls).where(and(eq(sandbagCalls.targetId, user.id), eq(sandbagCalls.status, 'open')));
  for (const call of open) {
    // Only workouts logged after the call can answer it, and backdating one in doesn't count.
    if (workout.updatedAt <= call.createdAt.getTime() || Date.parse(`${workout.date}T00:00:00Z`) < call.createdAt.getTime() - 86_400_000) continue;
    const entry = workout.entries.find((item) => exerciseKey(item.name) === call.exerciseKey && item.weight !== null);
    if (entry?.weight === undefined || entry.weight === null) continue;
    const status = resolveCall(call.targetWeight, entry.weight);
    await tx.update(sandbagCalls).set({ status, resolvedAt: new Date() }).where(eq(sandbagCalls.id, call.id));
    if (status === 'failed') {
      await tx.update(users)
        .set({ sandbagUntil: new Date(Date.now() + SANDBAG_BADGE_DAYS * 86_400_000) })
        .where(eq(users.id, user.id));
    }
    await notify(tx, call.callerId, {
      title: status === 'cleared' ? 'Call answered' : 'Sandbag confirmed',
      body: status === 'cleared' ? voice.callCleared(user.displayName, call.exercise) : voice.callFailed(user.displayName, call.exercise),
      route: 'rankings',
    });
  }
}

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
    const values = { ...doc, ownerId: user.id, seq: nextSeq() };
    await tx.insert(loggedWorkouts).values(values).onConflictDoUpdate({ target: [loggedWorkouts.ownerId, loggedWorkouts.id], set: values });
    written += 1;
    if (!existing) await settleCalls(tx, user, doc);
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
