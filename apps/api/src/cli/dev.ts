import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app';
import type { Db } from '../db/client';
import * as schema from '../db/schema';

// A local API for working on the app, in memory unless DATA_DIR is set. Never use it for real data.
const db = drizzle(new PGlite(process.env.DATA_DIR), { schema });
await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../migrations', import.meta.url)) });
const inviteCode = 'local-dev-invite-code';
const app = await buildApp(db as unknown as Db, { bootstrapInviteCode: inviteCode, logger: false });
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host });
console.log(`API on http://${host}:${port}, first invite code: ${inviteCode}`);
