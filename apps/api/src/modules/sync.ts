import { syncRequestSchema, type SyncResponse } from '@sandbag/shared';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { lockUser, type Db, type Tx } from '../db/client';
import { loggedWorkouts, savedWorkouts } from '../db/schema';
import { badRequest } from '../errors';
import { requireUser } from './auth';
import { notifyOvertaken, weekScores } from './rankings';
import { awardTrophies } from './trophies';
import { saveLogged, saveSaved, toLogged, toSaved } from './workouts';

const MAX_CLOCK_SKEW_MS = 86_400_000;

/**
 * Last write wins per document, on the client's updatedAt. Rejected writes fall
 * through to the response, because their server copy has a seq the sender may
 * already be past, so it's returned explicitly.
 */
export function syncRoutes(app: FastifyInstance, db: Db): void {
  app.post('/sync', { bodyLimit: 8 * 1024 * 1024 }, async (request): Promise<SyncResponse> => {
    const user = await requireUser(db, request);
    const input = syncRequestSchema.parse(request.body);
    const latest = Date.now() + MAX_CLOCK_SKEW_MS;
    for (const doc of [...input.loggedWorkouts, ...input.savedWorkouts]) {
      if (doc.updatedAt > latest) throw badRequest('Your phone’s clock looks wrong. Fix the date and try again.');
    }

    return db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      await lockUser(tx, user.id);
      const before = input.loggedWorkouts.length ? await weekScores(tx, user.id) : null;
      const { rejected: rejectedLogged, written } = await saveLogged(tx, user, input.loggedWorkouts);
      const rejectedSaved = await saveSaved(tx, user.id, input.savedWorkouts);
      if (before && written) {
        await notifyOvertaken(tx, user, before);
        await awardTrophies(tx, user);
      }

      const newLogged = await tx.select().from(loggedWorkouts).where(and(eq(loggedWorkouts.ownerId, user.id), gt(loggedWorkouts.seq, input.cursor)));
      const newSaved = await tx.select().from(savedWorkouts).where(and(eq(savedWorkouts.ownerId, user.id), gt(savedWorkouts.seq, input.cursor)));
      const cursor = Math.max(input.cursor, ...newLogged.map((row) => row.seq), ...newSaved.map((row) => row.seq));
      const seenLogged = new Set(newLogged.map((row) => row.id));
      const seenSaved = new Set(newSaved.map((row) => row.id));
      return {
        cursor,
        loggedWorkouts: [...newLogged.map(toLogged), ...rejectedLogged.filter((doc) => !seenLogged.has(doc.id))],
        savedWorkouts: [...newSaved.map(toSaved), ...rejectedSaved.filter((doc) => !seenSaved.has(doc.id))],
      };
    });
  });
}
