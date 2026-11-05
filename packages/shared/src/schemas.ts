import { z } from 'zod';
import type { CallStatus } from './calls';
import type { GoalChange, WeekBonuses } from './scoring';
import { canonicalZone } from './time';
import { cleanText } from './text';

const clientId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** User-written text, cleaned before it's measured, so invisible characters can't pad it out or pass for a name. */
const cleaned = (max: number, min = 1) => z.string().transform(cleanText).pipe(z.string().min(min).max(max));

const exerciseName = cleaned(100);
const count = z.number().int().min(0).max(1000).nullable();

export const MAX_VARIED_SETS = 20;
export const MAX_WEIGHT = 2000;
const weight = z.number().min(0).max(MAX_WEIGHT).nullable();
const setReps = z.array(count).max(MAX_VARIED_SETS).optional();
const setWeights = z.array(weight).max(MAX_VARIED_SETS).optional();
const setDrops = z.array(z.boolean()).max(MAX_VARIED_SETS).optional();

export const entrySchema = z.object({
  id: clientId,
  name: exerciseName,
  kind: z.enum(['strength', 'time']),
  sets: count,
  reps: count,
  // One value per set when they differ. `reps` stays the usual number, which the next session starts from.
  setReps,
  // One value per set when they differ. `weight` stays the heaviest, which is what older apps show.
  setWeights,
  // Which sets were drop sets: taken to failure, then on at lighter weights without a rest. Only the mark is kept.
  setDrops,
  weight,
  perSide: z.boolean(),
  // Whether the weight counts the bar or machine. Absent means it wasn't said, as on every older entry.
  includesEquipment: z.boolean().optional(),
  rpe: z.number().min(0).max(10).nullable(),
  minutes: z.number().min(0).max(1440).nullable(),
  note: cleaned(200, 0),
});
export type Entry = z.infer<typeof entrySchema>;

export const loggedWorkoutSchema = z.object({
  id: clientId,
  date: isoDate,
  title: cleaned(100),
  savedWorkoutId: clientId.nullable(),
  entries: z.array(entrySchema).max(100),
  updatedAt: z.number().int().nonnegative(),
  deleted: z.boolean(),
});
export type LoggedWorkout = z.infer<typeof loggedWorkoutSchema>;

export const savedExerciseSchema = z.object({
  name: exerciseName,
  kind: z.enum(['strength', 'time']),
  sets: count,
  reps: count,
});
export type SavedExercise = z.infer<typeof savedExerciseSchema>;

export const savedWorkoutSchema = z.object({
  id: clientId,
  name: cleaned(40),
  position: z.number().int().min(0).max(10000),
  exercises: z.array(savedExerciseSchema).max(100),
  savedFrom: z.string().max(40).nullable(),
  updatedAt: z.number().int().nonnegative(),
  deleted: z.boolean(),
});
export type SavedWorkout = z.infer<typeof savedWorkoutSchema>;

export const syncRequestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  loggedWorkouts: z.array(loggedWorkoutSchema).max(500),
  savedWorkouts: z.array(savedWorkoutSchema).max(500),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export interface SyncResponse {
  cursor: number;
  loggedWorkouts: LoggedWorkout[];
  savedWorkouts: SavedWorkout[];
}

export const AVATARS = [
  'flat_top', 'shades', 'mohawk', 'moustache', 'bun', 'beard', 'headband', 'curls',
  'bull', 'gorilla', 'potato', 'sandbag', 'dumbbell', 'frog',
] as const;
export type AvatarId = (typeof AVATARS)[number];

/** Everyone starts as a random character, stable per account. */
export function defaultAvatar(userId: string): AvatarId {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return AVATARS[hash % AVATARS.length]!;
}

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Use 3 to 24 letters, numbers or underscores');
const password = z.string().min(10, 'Use at least 10 characters').max(200);

export const registerSchema = z.object({
  username,
  displayName: cleaned(40),
  password,
  inviteCode: z.string().trim().min(1).max(32),
});
export const loginSchema = z.object({ username, password: z.string().min(1).max(200) });
/** Stored as the runtime spells it, so every copy of a zone is the same string. */
const timeZone = z.string().max(64).transform((zone, context) => canonicalZone(zone) ?? (context.addIssue({ code: 'custom', message: 'Unknown time zone' }), z.NEVER));

export const updateProfileSchema = z.object({
  displayName: cleaned(40).optional(),
  weeklyTarget: z.number().int().min(1).max(14).optional(),
  avatar: z.enum(AVATARS).optional(),
  timeZone: timeZone.optional(),
});
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(200) });
export const addFriendSchema = z.object({ inviteCode: z.string().trim().min(1).max(32) });

export const createPostSchema = z.object({
  // Chosen by the client, so resending after a lost response can't post twice.
  id: z.string().uuid(),
  kind: z.enum(['workout', 'share']),
  title: cleaned(100),
  caption: cleaned(140, 0),
  showWeights: z.boolean(),
  entries: z.array(entrySchema).min(1).max(100),
  // Empty means the whole crew.
  recipientIds: z.array(z.string().uuid()).max(100),
});
export const createReplySchema = z.object({ text: cleaned(140) });
export const createCallSchema = z.object({ exercise: exerciseName, line: cleaned(140) });
export const periodSchema = z.enum(['week', 'month']);
export type Period = z.infer<typeof periodSchema>;
/** What the rankings can show: a scored period, or every week added up. */
export const rankingPeriodSchema = z.enum(['week', 'month', 'all']);
export type RankingPeriod = z.infer<typeof rankingPeriodSchema>;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: AvatarId;
}

export interface Me extends PublicUser {
  /** The goal you chose. A change waits for next Monday, so this week may still run on the last one. */
  weeklyTarget: number;
  goalHistory: GoalChange[];
  timeZone: string | null;
  inviteCode: string;
}

export interface AuthResponse {
  token: string;
  user: Me;
}

export interface PostView {
  id: string;
  kind: 'workout' | 'share';
  author: PublicUser;
  title: string;
  caption: string;
  showWeights: boolean;
  entries: Entry[];
  createdAt: string;
  respects: number;
  respectedByMe: boolean;
  replyCount: number;
  callCount: number;
  /** Calls still waiting on a verdict, which is when a post stands out in the feed. */
  liveCalls: number;
  saveCount: number;
  savedByMe: boolean;
}

export interface ReplyView {
  id: string;
  author: PublicUser;
  text: string;
  createdAt: string;
}

export interface CallView {
  id: string;
  caller: PublicUser;
  target: PublicUser;
  exercise: string;
  /** Null when the post hid its weights and you aren't the one called out. */
  targetWeight: number | null;
  targetReps: number | null;
  line: string;
  status: CallStatus;
  /** When an open call fails, or a watched miss is believed. Null once it's settled. */
  deadlineAt: string | null;
  /** What it did to your score, as whichever side you're on. 0 when it isn't yours. */
  points: number;
  createdAt: string;
}

export interface RankingRow {
  streak: number;
  shields: number;
  user: PublicUser;
  rank: number;
  progress: number;
  workouts: number;
  target: number;
  consistency: number;
  /** Points from calls settled in the period, already part of score. */
  calls: number;
  /** This week's bonuses, already part of score. Null for the month and all time. */
  bonuses: WeekBonuses | null;
  score: number;
  wearingSandbag: boolean;
}

/** What a notification is about, so the app can show it at a glance without reading the title. */
export type NotificationKind = 'call' | 'answered' | 'confirmed' | 'watching' | 'honest' | 'reply' | 'saved' | 'recruit' | 'overtaken' | 'trophy' | 'nudge';

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  route: string | null;
  read: boolean;
  createdAt: string;
}

export interface InviteSummary {
  code: string;
  joined: number;
  nextGoal: { count: number; name: string } | null;
  recruiters: { user: PublicUser; joined: number }[];
}

export interface TrophyView {
  id: string;
  name: string;
  detail: string;
  goal: number;
  progress: number;
  earnedAt: string | null;
}

const optionalCount = count.optional().default(null);

const apiEntrySchema = z.object({
  id: clientId.optional(),
  name: exerciseName,
  kind: z.enum(['strength', 'time']).default('strength'),
  sets: optionalCount,
  reps: optionalCount,
  setReps,
  setWeights,
  setDrops,
  weight: weight.default(null),
  perSide: z.boolean().default(false),
  includesEquipment: z.boolean().optional(),
  rpe: z.number().min(0).max(10).nullable().default(null),
  minutes: z.number().min(0).max(1440).nullable().default(null),
  note: cleaned(200, 0).default(''),
});

/** The public API's shape: only name and date are required, everything else has a default. */
export const apiWorkoutSchema = z.object({
  id: clientId.optional(),
  date: isoDate,
  title: cleaned(100).default('Workout'),
  savedWorkoutId: clientId.nullable().default(null),
  entries: z.array(apiEntrySchema).min(1).max(100),
});
export const apiWorkoutsSchema = z.object({ workouts: z.array(apiWorkoutSchema).min(1).max(500) });
export const apiSavedWorkoutSchema = z.object({
  id: clientId.optional(),
  name: cleaned(40),
  exercises: z.array(z.object({
    name: exerciseName,
    kind: z.enum(['strength', 'time']).default('strength'),
    sets: optionalCount,
    reps: optionalCount,
  })).max(100),
});
export const createApiKeySchema = z.object({ name: cleaned(40), password: z.string().min(1).max(200) });

export const pushTokenSchema = z.object({ token: z.string().min(20).max(4096) });

export interface ApiKeyView {
  id: string;
  name: string;
  /** The first characters, so you can tell keys apart. The full key is shown once. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface DataExport {
  exportedAt: string;
  profile: Me;
  loggedWorkouts: LoggedWorkout[];
  savedWorkouts: SavedWorkout[];
  posts: { id: string; kind: 'workout' | 'share'; title: string; caption: string; entries: Entry[]; createdAt: string }[];
}
