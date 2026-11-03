import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { changePasswordSchema, defaultAvatar, deleteAccountSchema, loginSchema, registerSchema, updateProfileSchema, voice, type AuthResponse, type AvatarId, type DataExport, type Me, type PublicUser } from '@sandbag/shared';
import { and, eq, lt, ne, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { lockUser, type Db, type DbOrTx, type Tx } from '../db/client';
import { apiKeys, authSessions, loggedWorkouts, posts, savedWorkouts, users } from '../db/schema';
import { conflict, HttpError, unauthorized } from '../errors';
import { befriend } from './friends';
import { notify } from './notifications';

const SESSION_DAYS = 90;
const DAY_MS = 86_400_000;

// The web app keeps its session where page scripts can't read it. Phones use their
// secure storage and a bearer token. The server decides when a session ends, so the
// cookie just lasts as long as browsers allow.
const SESSION_COOKIE = 'sandbag_session';
const COOKIE_ATTRIBUTES = 'HttpOnly; Secure; SameSite=Strict; Path=/api';
const COOKIE_MAX_AGE_SECONDS = 400 * 86_400;
const WEB_CLIENT_HEADER = 'x-sandbag-web';
// Spends the same time on an unknown username, so logins can't probe for accounts.
const DUMMY_HASH = await hash('sandbag-timing-equalizer');

// Per-IP limits don't stop guessing one account from many addresses. Existing
// sessions keep working, so this can delay a login but can't lock anyone out of the app.
const MAX_FAILED_LOGINS = 20;
const FAILED_LOGIN_WINDOW_MS = 15 * 60_000;
const failedLogins = new Map<string, { count: number; resetAt: number }>();

function assertLoginAllowed(username: string): void {
  const record = failedLogins.get(username);
  if (record && record.resetAt > Date.now() && record.count >= MAX_FAILED_LOGINS) {
    throw new HttpError(429, 'Too many wrong passwords. Try again in a few minutes.');
  }
}

function recordFailedLogin(username: string): void {
  const now = Date.now();
  for (const [key, record] of failedLogins) if (record.resetAt <= now) failedLogins.delete(key);
  const record = failedLogins.get(username) ?? { count: 0, resetAt: now + FAILED_LOGIN_WINDOW_MS };
  record.count += 1;
  failedLogins.set(username, record);
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newInviteCode = () => randomBytes(6).toString('base64url').toUpperCase().replace(/[-_]/g, 'X');

export function toPublic(user: { id: string; username: string; displayName: string; avatar: AvatarId | null }): PublicUser {
  return { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar ?? defaultAvatar(user.id) };
}

function toMe(user: typeof users.$inferSelect): Me {
  return { ...toPublic(user), weeklyTarget: user.weeklyTarget, inviteCode: user.inviteCode };
}

async function createSession(db: DbOrTx, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(authSessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS),
  });
  return token;
}

function presentedToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  // Browsers attach cookies on their own, so a change also needs a header other sites can't send.
  if (!['GET', 'HEAD'].includes(request.method) && !request.headers[WEB_CLIENT_HEADER]) return null;
  return request.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9_-]+)`))?.[1] ?? null;
}

function issueSession(request: FastifyRequest, reply: FastifyReply, token: string, user: Me): AuthResponse {
  if (!request.headers[WEB_CLIENT_HEADER]) return { token, user };
  reply.header('Set-Cookie', `${SESSION_COOKIE}=${token}; ${COOKIE_ATTRIBUTES}; Max-Age=${COOKIE_MAX_AGE_SECONDS}`);
  return { token: '', user };
}

/** The current session's id, for the things that should end when it does. */
export function sessionHash(request: FastifyRequest): string {
  const token = presentedToken(request);
  if (!token) throw unauthorized();
  return hashToken(token);
}

export async function requireUser(db: Db, request: FastifyRequest): Promise<typeof users.$inferSelect> {
  const token = presentedToken(request);
  if (!token) throw unauthorized();
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ user: users, expiresAt: authSessions.expiresAt })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.tokenHash, tokenHash));
  const now = Date.now();
  if (!row || row.expiresAt.getTime() < now) throw unauthorized();
  // Using the app keeps you signed in. Writing at most daily keeps this off every request.
  const expiresAt = now + SESSION_DAYS * DAY_MS;
  if (expiresAt - row.expiresAt.getTime() > DAY_MS) {
    await db.update(authSessions).set({ expiresAt: new Date(expiresAt) }).where(eq(authSessions.tokenHash, tokenHash));
  }
  return row.user;
}

export function authRoutes(app: FastifyInstance, db: Db, config: { bootstrapInviteCode?: string }): void {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/register', strict, async (request, reply): Promise<AuthResponse> => {
    const input = registerSchema.parse(request.body);
    const passwordHash = await hash(input.password);
    const result = await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      // One at a time, so two people can't both claim the bootstrap code.
      await lockUser(tx, 'register');
      // Invite-only: this is a public service holding friends' data.
      const [inviter] = await tx.select().from(users).where(eq(users.inviteCode, input.inviteCode.toUpperCase()));
      if (!inviter) {
        const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(users);
        const isFounder = total === 0 && Boolean(config.bootstrapInviteCode) && input.inviteCode.toUpperCase() === config.bootstrapInviteCode?.toUpperCase();
        if (!isFounder) throw new HttpError(400, 'That invite code isn’t valid');
      }
      const [user] = await tx.insert(users).values({
        username: input.username,
        displayName: input.displayName,
        passwordHash,
        inviteCode: newInviteCode(),
        invitedBy: inviter?.id ?? null,
      }).onConflictDoNothing({ target: users.username }).returning();
      if (!user) throw conflict('That username is taken');
      if (inviter) {
        await befriend(tx, inviter.id, user.id);
        await notify(tx, inviter.id, { kind: 'recruit', title: 'New recruit', body: voice.friendJoined(user.displayName), route: 'invites' });
      }
      return { token: await createSession(tx, user.id), user: toMe(user) };
    });
    reply.code(201);
    return issueSession(request, reply, result.token, result.user);
  });

  app.post('/auth/login', strict, async (request, reply): Promise<AuthResponse> => {
    const input = loginSchema.parse(request.body);
    assertLoginAllowed(input.username);
    // Counted before checking, so a burst of guesses all at once can't slip past the limit.
    recordFailedLogin(input.username);
    const [user] = await db.select().from(users).where(eq(users.username, input.username));
    const valid = await verify(user?.passwordHash ?? DUMMY_HASH, input.password);
    if (!user || !valid) throw new HttpError(401, 'Wrong username or password');
    failedLogins.delete(input.username);
    await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
    return issueSession(request, reply, await createSession(db, user.id), toMe(user));
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = presentedToken(request);
    if (token) await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
    if (request.headers[WEB_CLIENT_HEADER]) reply.header('Set-Cookie', `${SESSION_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`);
    reply.code(204);
  });

  app.get('/me', async (request): Promise<Me> => toMe(await requireUser(db, request)));

  app.patch('/me', async (request): Promise<Me> => {
    const user = await requireUser(db, request);
    const input = updateProfileSchema.parse(request.body);
    const [updated] = await db.update(users).set(input).where(eq(users.id, user.id)).returning();
    if (!updated) throw unauthorized();
    return toMe(updated);
  });

  // Signs out every other device and revokes API keys, in case the old password is why this is happening.
  app.post('/me/password', strict, async (request, reply) => {
    const user = await requireUser(db, request);
    const input = changePasswordSchema.parse(request.body);
    if (!(await verify(user.passwordHash, input.currentPassword))) throw new HttpError(400, 'That isn’t your current password');
    const passwordHash = await hash(input.newPassword);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
      await tx.delete(apiKeys).where(eq(apiKeys.userId, user.id));
      await tx.delete(authSessions).where(and(eq(authSessions.userId, user.id), ne(authSessions.tokenHash, hashToken(presentedToken(request)!))));
    });
    reply.code(204);
  });

  // Your numbers are yours: everything you wrote, in one file.
  app.get('/me/export', async (request): Promise<DataExport> => {
    const user = await requireUser(db, request);
    const logged = await db.select().from(loggedWorkouts).where(eq(loggedWorkouts.ownerId, user.id));
    const saved = await db.select().from(savedWorkouts).where(eq(savedWorkouts.ownerId, user.id));
    const written = await db.select().from(posts).where(eq(posts.authorId, user.id));
    return {
      exportedAt: new Date().toISOString(),
      profile: toMe(user),
      loggedWorkouts: logged.filter((row) => !row.deleted).map((row) => ({ id: row.id, date: row.date, title: row.title, savedWorkoutId: row.savedWorkoutId, entries: row.entries, updatedAt: row.updatedAt, deleted: false })),
      savedWorkouts: saved.filter((row) => !row.deleted).map((row) => ({ id: row.id, name: row.name, position: row.position, exercises: row.exercises, savedFrom: row.savedFrom, updatedAt: row.updatedAt, deleted: false })),
      posts: written.map((row) => ({ id: row.id, kind: row.kind, title: row.title, caption: row.caption, entries: row.entries, createdAt: row.createdAt.toISOString() })),
    };
  });

  // Foreign keys cascade, so this removes everything the person ever posted.
  // Asks for the password again: a stolen session shouldn't be able to destroy an account.
  app.delete('/me', strict, async (request, reply) => {
    const user = await requireUser(db, request);
    const { password } = deleteAccountSchema.parse(request.body);
    if (!(await verify(user.passwordHash, password))) throw new HttpError(400, 'That isn’t your password');
    await db.delete(users).where(eq(users.id, user.id));
    reply.code(204);
  });
}
