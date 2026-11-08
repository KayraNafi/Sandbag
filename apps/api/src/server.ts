import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { buildApp } from './app';
import { connect } from './db/client';
import { startImporting } from './integrations/inbox';

const env = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().default(8080),
  BOOTSTRAP_INVITE_CODE: z.string().min(16).optional(),
  TRUSTED_PROXIES: z.coerce.number().int().default(1),
  // Compose passes an unset one as empty.
  WEB_PUSH_PUBLIC_KEY: z.string().optional().transform((value) => value || undefined),
  INTEGRATION_PUBLIC_KEY: z.string().optional().transform((value) => value || undefined),
}).parse(process.env);

const migrationsFolder = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../migrations', import.meta.url));
const { db, close } = await connect(env.DATABASE_URL, migrationsFolder);
const app = await buildApp(db, { bootstrapInviteCode: env.BOOTSTRAP_INVITE_CODE, trustedProxies: env.TRUSTED_PROXIES, webPushPublicKey: env.WEB_PUSH_PUBLIC_KEY, integrationPublicKey: env.INTEGRATION_PUBLIC_KEY, logger: true });
// What the import worker fetched becomes sessions here, where the rules for saving live.
const stopImporting = startImporting(db, (error) => app.log.error(error));

async function shutdown() {
  stopImporting();
  await app.close();
  await close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: '0.0.0.0', port: env.PORT });
