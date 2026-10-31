import { z } from 'zod';

const clientId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const exerciseName = z.string().trim().min(1).max(100);
const count = z.number().int().min(0).max(1000).nullable();

export const entrySchema = z.object({
  id: clientId,
  name: exerciseName,
  kind: z.enum(['strength', 'time']),
  sets: count,
  reps: count,
  weight: z.number().min(0).max(2000).nullable(),
  perSide: z.boolean(),
  rpe: z.number().min(0).max(10).nullable(),
  minutes: z.number().min(0).max(1440).nullable(),
  note: z.string().max(200),
});
export type Entry = z.infer<typeof entrySchema>;

export const loggedWorkoutSchema = z.object({
  id: clientId,
  date: isoDate,
  title: z.string().trim().min(1).max(100),
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
  name: z.string().trim().min(1).max(40),
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
  displayName: z.string().trim().min(1).max(40),
  password,
  inviteCode: z.string().trim().min(1).max(32),
});
export const loginSchema = z.object({ username, password: z.string().min(1).max(200) });
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  weeklyTarget: z.number().int().min(1).max(14).optional(),
  avatar: z.enum(AVATARS).optional(),
});
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });
export const addFriendSchema = z.object({ inviteCode: z.string().trim().min(1).max(32) });

export const createPostSchema = z.object({
  // Chosen by the client, so resending after a lost response can't post twice.
  id: z.string().uuid(),
  kind: z.enum(['workout', 'share']),
  title: z.string().trim().min(1).max(100),
  caption: z.string().trim().max(140),
  showWeights: z.boolean(),
  entries: z.array(entrySchema).min(1).max(100),
  // Empty means the whole crew.
  recipientIds: z.array(z.string().uuid()).max(100),
});
export const createReplySchema = z.object({ text: z.string().trim().min(1).max(140) });
export const createCallSchema = z.object({ exercise: exerciseName, line: z.string().trim().min(1).max(140) });
export const periodSchema = z.enum(['week', 'month']);
export type Period = z.infer<typeof periodSchema>;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: AvatarId;
}

export interface Me extends PublicUser {
  weeklyTarget: number;
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
  line: string;
  status: 'open' | 'cleared' | 'failed';
  createdAt: string;
}

export interface RankingRow {
  streak: number;
  user: PublicUser;
  rank: number;
  progress: number;
  workouts: number;
  target: number;
  consistency: number;
  score: number;
  wearingSandbag: boolean;
}

export interface NotificationView {
  id: string;
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
  weight: z.number().min(0).max(2000).nullable().default(null),
  perSide: z.boolean().default(false),
  rpe: z.number().min(0).max(10).nullable().default(null),
  minutes: z.number().min(0).max(1440).nullable().default(null),
  note: z.string().max(200).default(''),
});

/** The public API's shape: only name and date are required, everything else has a default. */
export const apiWorkoutSchema = z.object({
  id: clientId.optional(),
  date: isoDate,
  title: z.string().trim().min(1).max(100).default('Workout'),
  savedWorkoutId: clientId.nullable().default(null),
  entries: z.array(apiEntrySchema).min(1).max(100),
});
export const apiWorkoutsSchema = z.object({ workouts: z.array(apiWorkoutSchema).min(1).max(500) });
export const apiSavedWorkoutSchema = z.object({
  id: clientId.optional(),
  name: z.string().trim().min(1).max(40),
  exercises: z.array(z.object({
    name: exerciseName,
    kind: z.enum(['strength', 'time']).default('strength'),
    sets: optionalCount,
    reps: optionalCount,
  })).max(100),
});
export const createApiKeySchema = z.object({ name: z.string().trim().min(1).max(40), password: z.string().min(1).max(200) });

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
