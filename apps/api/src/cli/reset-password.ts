import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { connect } from '../db/client';
import { apiKeys, authSessions, users } from '../db/schema';

// There's no email on file by design, so a forgotten password is an admin job:
//   DATABASE_URL=... node dist/reset-password.js <username>
const username = process.argv[2]?.toLowerCase();
const databaseUrl = process.env.DATABASE_URL;
if (!username || !databaseUrl) {
  console.error('Usage: DATABASE_URL=... reset-password <username>');
  process.exit(1);
}

const { db, close } = await connect(databaseUrl, process.env.MIGRATIONS_DIR ?? './migrations');
const temporary = randomBytes(12).toString('base64url');
const [user] = await db.update(users).set({ passwordHash: await hash(temporary) }).where(eq(users.username, username)).returning({ id: users.id });
if (!user) {
  console.error('No such user');
  await close();
  process.exit(1);
}
await db.delete(authSessions).where(eq(authSessions.userId, user.id));
await db.delete(apiKeys).where(eq(apiKeys.userId, user.id));
console.log(`Temporary password for ${username}: ${temporary}`);
await close();
