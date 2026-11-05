import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyHttpOptions, type FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import { isIPv6 } from 'node:net';
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

/** One IPv6 customer gets billions of addresses, so a limit per address wouldn't limit them. */
function rateLimitKey(ip: string): string {
  if (!isIPv6(ip)) return ip;
  if (ip.toLowerCase().startsWith('::ffff:')) return ip.slice(7);
  const [head = '', tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  return `${groups.slice(0, 4).map((group) => parseInt(group, 16).toString(16)).join(':')}::/64`;
}

export interface AppConfig {
  bootstrapInviteCode?: string;
  /** Number of reverse proxies in front of the app, so rate limits see real IPs. */
  trustedProxies?: number;
  logger?: boolean;
  /** Turns on notifications for the web app. The private half stays with the push worker. */
  webPushPublicKey?: string;
}

export async function buildApp(db: Db, config: AppConfig = {}): Promise<FastifyInstance> {
  const proxies = config.trustedProxies ?? 0;
  const options: FastifyHttpOptions<Server> = {
    logger: config.logger ?? false,
    trustProxy: (_address, hop) => hop < proxies,
    bodyLimit: 1024 * 1024,
  };
  const app = Fastify(options);

  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute', keyGenerator: (request) => rateLimitKey(request.ip) });

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
    // A value Postgres can't store, like a null byte: bad input, not a broken server.
    const { cause, code } = error as { cause?: { code?: unknown }; code?: unknown };
    if (String(cause?.code ?? code).startsWith('22')) return reply.code(400).send({ error: 'Invalid request' });
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
  pushRoutes(app, db, config.webPushPublicKey);
  apiKeyRoutes(app, db);
  publicApiRoutes(app, db);
  return app;
}
