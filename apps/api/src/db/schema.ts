import type { Activity, AvatarId, CallStatus, Entry, GoalChange, NotificationKind, PostedRun, SavedExercise } from '@sandbag/shared';
import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, date, doublePrecision, foreignKey, index, integer, jsonb, pgSequence, pgTable, primaryKey, real, text, timestamp, uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  // Null means the account's default character, derived from its id.
  avatar: text('avatar').$type<AvatarId>(),
  passwordHash: text('password_hash').notNull(),
  weeklyTarget: integer('weekly_target').notNull().default(3),
  // Empty means weeklyTarget has applied all along. Each change takes effect the Monday after it's made.
  goalHistory: jsonb('goal_history').$type<GoalChange[]>().notNull().default([]),
  // Set by the app. Null means UTC, which is how everyone was counted before.
  timeZone: text('time_zone'),
  inviteCode: text('invite_code').notNull().unique(),
  // The invite count is derived from this column, so only real joins count.
  invitedBy: uuid('invited_by').references((): any => users.id, { onDelete: 'set null' }),
  sandbagUntil: timestamp('sandbag_until', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('users_invited_by').on(t.invitedBy)]);

export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [index('auth_sessions_user').on(t.userId)]);

// One row per pair, stored with the lower id first.
export const friendships = pgTable('friendships', {
  userA: uuid('user_a').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userB: uuid('user_b').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.userA, t.userB] }),
  index('friendships_user_b').on(t.userB),
  check('friendships_ordered', sql`${t.userA} < ${t.userB}`),
]);

export const syncSeq = pgSequence('sync_seq');

export const loggedWorkouts = pgTable('logged_workouts', {
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  title: text('title').notNull(),
  savedWorkoutId: text('saved_workout_id'),
  entries: jsonb('entries').$type<Entry[]>().notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  deleted: boolean('deleted').notNull().default(false),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  // The server's clock, unlike updatedAt: when these numbers last changed. Written up long after its date, a session can't set a best.
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.ownerId, t.id] }),
  index('logged_workouts_seq').on(t.ownerId, t.seq),
  index('logged_workouts_date').on(t.ownerId, t.date),
]);

export const runs = pgTable('runs', {
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  activity: text('activity').$type<Activity>().notNull(),
  distanceKm: doublePrecision('distance_km').notNull(),
  seconds: integer('seconds').notNull(),
  note: text('note').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  deleted: boolean('deleted').notNull().default(false),
  seq: bigint('seq', { mode: 'number' }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.ownerId, t.id] }),
  index('runs_seq').on(t.ownerId, t.seq),
  index('runs_date').on(t.ownerId, t.date),
  check('runs_activity', sql`${t.activity} in ('run', 'walk')`),
]);

export const savedWorkouts = pgTable('saved_workouts', {
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  exercises: jsonb('exercises').$type<SavedExercise[]>().notNull(),
  savedFrom: text('saved_from'),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  deleted: boolean('deleted').notNull().default(false),
  seq: bigint('seq', { mode: 'number' }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.ownerId, t.id] }),
  index('saved_workouts_seq').on(t.ownerId, t.seq),
]);

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['workout', 'share', 'run'] }).notNull(),
  title: text('title').notNull(),
  caption: text('caption').notNull(),
  showWeights: boolean('show_weights').notNull(),
  // Empty on a run post.
  entries: jsonb('entries').$type<Entry[]>().notNull(),
  // A run as it was when posted. Set on a run post, and only there.
  run: jsonb('run').$type<PostedRun>(),
  // Null means the whole crew at the time of reading.
  recipientIds: uuid('recipient_ids').array(),
  // What the post shows, so the app can tell you've already shown it. Null on a saved workout, and on posts made
  // before these existed.
  loggedWorkoutId: text('logged_workout_id'),
  runId: text('run_id'),
  createdAt: createdAt(),
}, (t) => [
  index('posts_author_created').on(t.authorId, t.createdAt),
  index('posts_logged_workout').on(t.authorId, t.loggedWorkoutId),
  index('posts_run_id').on(t.authorId, t.runId),
  check('posts_run', sql`(${t.kind} = 'run') = (${t.run} is not null)`),
  check('posts_source', sql`${t.loggedWorkoutId} is null or ${t.kind} = 'workout'`),
  check('posts_run_source', sql`${t.runId} is null or ${t.kind} = 'run'`),
  // Your own session or run only. Neither is ever removed, only marked deleted, so a post never loses what it points at.
  foreignKey({ columns: [t.authorId, t.loggedWorkoutId], foreignColumns: [loggedWorkouts.ownerId, loggedWorkouts.id] }),
  foreignKey({ columns: [t.authorId, t.runId], foreignColumns: [runs.ownerId, runs.id] }),
]);

export const postRespects = pgTable('post_respects', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const postSaves = pgTable('post_saves', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const postReplies = pgTable('post_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  createdAt: createdAt(),
}, (t) => [index('post_replies_post').on(t.postId, t.createdAt)]);

export const sandbagCalls = pgTable('sandbag_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  callerId: uuid('caller_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
  exercise: text('exercise').notNull(),
  exerciseKey: text('exercise_key').notNull(),
  targetWeight: real('target_weight').notNull(),
  targetReps: integer('target_reps'),
  // The estimated max to beat. Double, so the same numbers logged again come out exactly equal.
  targetMax: doublePrecision('target_max').notNull(),
  weightsHidden: boolean('weights_hidden').notNull(),
  line: text('line').notNull(),
  status: text('status').$type<CallStatus>().notNull().default('open'),
  createdAt: createdAt(),
  // When an open call fails, or a watched miss is believed.
  deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  // The session that last answered it, so editing or deleting that session revisits the verdict.
  settledBy: text('settled_by'),
  // A failed verdict can be corrected once, for a typo.
  correctedAt: timestamp('corrected_at', { withTimezone: true }),
}, (t) => [
  // One open call per lift is checked when calling, not here: deleting the session that
  // answered a call reopens it, and that must work even if the lift has been called again since.
  index('sandbag_calls_target_lift').on(t.targetId, t.exerciseKey),
  index('sandbag_calls_caller').on(t.callerId),
  index('sandbag_calls_post').on(t.postId),
  index('sandbag_calls_due').on(t.deadlineAt).where(sql`${t.status} in ('open', 'watching')`),
]);

/** The last nudge each person sent each friend, which is all the once-a-day rule needs. */
export const nudges = pgTable('nudges', {
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  receiverId: uuid('receiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.senderId, t.receiverId] })]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<NotificationKind>().notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  route: text('route'),
  readAt: timestamp('read_at', { withTimezone: true }),
  // Null until the push worker has dealt with it. See modules/push.ts.
  pushedAt: timestamp('pushed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index('notifications_user_created').on(t.userId, t.createdAt),
  index('notifications_unpushed').on(t.createdAt).where(sql`${t.pushedAt} is null`),
]);

// Belongs to a session, so signing out or changing your password stops that phone's pushes.
export const pushTokens = pgTable('push_tokens', {
  token: text('token').primaryKey(),
  sessionHash: text('session_hash').notNull().references(() => authSessions.tokenHash, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [index('push_tokens_user').on(t.userId)]);

// The web app's version of a push token: where the browser's push service takes messages,
// and the keys to encrypt them for it. Tied to a session the same way.
export const webPushSubscriptions = pgTable('web_push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  sessionHash: text('session_hash').notNull().references(() => authSessions.tokenHash, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [index('web_push_subscriptions_user').on(t.userId)]);

// Long-lived keys for the public API. Like sessions, only the hash is stored.
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('api_keys_user').on(t.userId)]);

export const userTrophies = pgTable('user_trophies', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  trophyId: text('trophy_id').notNull(),
  earnedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.trophyId] })]);
