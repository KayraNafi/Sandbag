import {
  connectIntegrationSchema, disconnectIntegrationSchema, importedWorkoutId, INTEGRATION_IDS, INTEGRATIONS, isIntegrationId,
  type IntegrationId, type IntegrationsResponse, type IntegrationView,
} from '@sandbag/shared';
import { and, eq, like, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { lockUser, type Db, type Tx } from '../db/client';
import { integrationImports, integrations, loggedWorkouts } from '../db/schema';
import { badRequest, notFound } from '../errors';
import { requireUser } from '../modules/auth';
import { saveLogged, toLogged } from '../modules/workouts';
import { MAX_SEALED_BYTES, sealKey } from './sealing';

const providerOf = (value: string): IntegrationId => {
  if (!isIntegrationId(value)) throw notFound();
  return value;
};

/** A provider's sessions, found by the id prefix they're stored under. */
const importedBy = (userId: string, provider: IntegrationId) =>
  and(eq(loggedWorkouts.ownerId, userId), like(loggedWorkouts.id, `${importedWorkoutId(provider, '')}%`), eq(loggedWorkouts.deleted, false));

async function viewsFor(db: Db, userId: string): Promise<IntegrationView[]> {
  const rows = await db.select().from(integrations).where(eq(integrations.userId, userId));
  return Promise.all(rows.map(async (row) => {
    const [{ imported } = { imported: 0 }] = await db.select({ imported: sql<number>`count(*)::int` }).from(loggedWorkouts).where(importedBy(userId, row.provider));
    return { provider: row.provider, settings: row.settings, status: row.status, syncedAt: row.syncedAt?.toISOString() ?? null, imported };
  }));
}

/**
 * sealingKey: the import worker's public key. Without it this server doesn't import, and says so, since
 * nothing could ever read a key it stored.
 */
export function integrationRoutes(app: FastifyInstance, db: Db, sealingKey?: string): void {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/me/integrations', async (request): Promise<IntegrationsResponse> => {
    const user = await requireUser(db, request);
    return { available: sealingKey ? INTEGRATION_IDS : [], connected: await viewsFor(db, user.id) };
  });

  // Connecting again replaces the key and settings, and imports everything again under the new settings.
  app.put<{ Params: { provider: string } }>('/me/integrations/:provider', strict, async (request): Promise<IntegrationView> => {
    const user = await requireUser(db, request);
    const provider = providerOf(request.params.provider);
    if (!sealingKey) throw notFound('Importing from other apps isn’t set up on this server');
    const input = connectIntegrationSchema.parse(request.body);
    const settings = INTEGRATIONS[provider].settingsSchema.parse(input.settings);
    if (Buffer.byteLength(input.key) > MAX_SEALED_BYTES) throw badRequest('That key is too long');
    const values = { sealedKey: sealKey(sealingKey, input.key), settings, status: 'connecting' as const, syncedAt: null, checkedAt: null };
    await db.transaction(async (tx) => {
      await tx.insert(integrations).values({ userId: user.id, provider, ...values })
        .onConflictDoUpdate({ target: [integrations.userId, integrations.provider], set: values });
      await tx.update(integrationImports).set({ importedAt: null })
        .where(and(eq(integrationImports.userId, user.id), eq(integrationImports.provider, provider)));
    });
    const view = (await viewsFor(db, user.id)).find((item) => item.provider === provider);
    return view!;
  });

  // The sessions stay in History unless asked to go too.
  app.delete<{ Params: { provider: string } }>('/me/integrations/:provider', async (request, reply) => {
    const user = await requireUser(db, request);
    const provider = providerOf(request.params.provider);
    const { removeWorkouts } = disconnectIntegrationSchema.parse(request.body ?? {});
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      await lockUser(tx, user.id);
      if (removeWorkouts) {
        const rows = await tx.select().from(loggedWorkouts).where(importedBy(user.id, provider));
        await saveLogged(tx, user, rows.map((row) => ({ ...toLogged(row), deleted: true, updatedAt: Math.max(Date.now(), row.updatedAt + 1) })));
      }
      await tx.delete(integrations).where(and(eq(integrations.userId, user.id), eq(integrations.provider, provider)));
    });
    reply.code(204);
  });
}
