import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app';
import { FETCHERS } from '../integrations/fetchers';
import { startImporting } from '../integrations/inbox';
import { LYFTA_SANDBOX, lyftaFetcher } from '../integrations/lyfta';
import { pullDue } from '../integrations/pull';
import { makeSealingKeys } from '../integrations/sealing';
import type { Db } from '../db/client';
import * as schema from '../db/schema';

// A local API for working on the app, in memory unless DATA_DIR is set. Never use it for real data.
const pglite = new PGlite(process.env.DATA_DIR);
const db = drizzle(pglite, { schema });
await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../migrations', import.meta.url)) });
const inviteCode = 'local-dev-invite-code';
// The import worker runs in here too, with a key pair made for this run. LYFTA_SANDBOX=1 imports Lyfta's sample data, for any key.
const sealing = makeSealingKeys();
const fetchers = process.env.LYFTA_SANDBOX ? { ...FETCHERS, lyfta: lyftaFetcher({ path: LYFTA_SANDBOX }) } : FETCHERS;
const app = await buildApp(db as unknown as Db, { bootstrapInviteCode: inviteCode, logger: false, integrationPublicKey: sealing.publicKey });
startImporting(db as unknown as Db, console.error);
setInterval(() => void pullDue(db as unknown as Db, sealing.privateKey, fetchers, console.error).catch(console.error), 10_000);
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host });
// A killed PGlite can refuse to open its folder again, so a saved DATA_DIR needs a proper goodbye.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => pglite.close()).finally(() => process.exit(0));
  });
}
console.log(`API on http://${host}:${port}, first invite code: ${inviteCode}`);
