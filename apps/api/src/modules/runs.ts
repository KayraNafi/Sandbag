import type { Run } from '@sandbag/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { runs, syncSeq } from '../db/schema';

const nextSeq = () => sql<number>`nextval(${syncSeq.seqName})`;

export const toRun = (row: typeof runs.$inferSelect): Run => ({
  id: row.id, date: row.date, activity: row.activity, distanceKm: row.distanceKm, seconds: row.seconds, note: row.note, updatedAt: row.updatedAt, deleted: row.deleted,
});

/** Last write wins on updatedAt, as for workouts. Returns the server copies that beat what was sent. */
export async function saveRuns(tx: Tx, userId: string, docs: Run[]): Promise<{ rejected: Run[]; written: number }> {
  const rejected: Run[] = [];
  let written = 0;
  for (const doc of docs) {
    const [existing] = await tx.select().from(runs).where(and(eq(runs.ownerId, userId), eq(runs.id, doc.id)));
    if (existing && existing.updatedAt >= doc.updatedAt) {
      if (existing.updatedAt > doc.updatedAt) rejected.push(toRun(existing));
      continue;
    }
    const values = { ...doc, ownerId: userId, seq: nextSeq() };
    await tx.insert(runs).values(values).onConflictDoUpdate({ target: [runs.ownerId, runs.id], set: values });
    written += 1;
  }
  return { rejected, written };
}
