import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyHttpOptions, type FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import { ZodError } from 'zod';
import type { Db } from './db/client';
import { HttpError } from './errors';
import { authRoutes } from './modules/auth';
import { feedRoutes } from './modules/feed';
import { friendRoutes } from './modules/friends';
import { notificationRoutes } from './modules/notifications';
import { pushRoutes } from './modules/push';
import { rankingRoutes } from './modules/rankings';
import { apiKeyRoutes, publicApiRoutes } from './modules/publicApi';
import { trophyRoutes } from './modules/trophies';
import { syncRoutes } from './modules/sync';

export interface AppConfig {
  bootstrapInviteCode?: string;
  /** Number of reverse proxies in front of the app, so rate limits see real IPs. */
  trustedProxies?: number;
  logger?: boolean;
}

export async function buildApp(db: Db, config: AppConfig = {}): Promise<FastifyInstance> {
  const proxies = config.trustedProxies ?? 0;
  const options: FastifyHttpOptions<Server> = {
    logger: config.logger ?? false,
    trustProxy: (_address, hop) => hop < proxies,
    bodyLimit: 1024 * 1024,
  };
  const app = Fastify(options);

  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      // API clients get told which field. The app validates first, so its users never see this.
      const where = request.url.startsWith('/v1') && issue?.path.length ? `${issue.path.join('.')}: ` : '';
      return reply.code(400).send({ error: `${where}${issue?.message ?? 'Invalid request'}` });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    const { statusCode } = error as { statusCode?: number };
    if (statusCode && statusCode < 500) {
      return reply.code(statusCode).send({ error: (error as Error).message });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'Something broke on our side' });
  });

  app.get('/healthz', async () => ({ ok: true }));
  authRoutes(app, db, { bootstrapInviteCode: config.bootstrapInviteCode });
  friendRoutes(app, db);
  syncRoutes(app, db);
  feedRoutes(app, db);
  rankingRoutes(app, db);
  notificationRoutes(app, db);
  trophyRoutes(app, db);
  pushRoutes(app, db);
  apiKeyRoutes(app, db);
  publicApiRoutes(app, db);
  return app;
}
