import { sql, type ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

type Schema = typeof schema;

/** Works with both the production driver and the in-process test database. */
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type DbOrTx = Db | Tx;

export async function connect(databaseUrl: string, migrationsFolder?: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });
  if (migrationsFolder) await migrate(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.end() };
}

/** Serializes a user's sync so their seq values commit in order. */
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
}
