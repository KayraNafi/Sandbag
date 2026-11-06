import { Platform } from 'react-native';
import type {
  ApiKeyView, TrophyView, AuthResponse, AvatarId, CallView, InviteSummary, Me, NotificationView, PostView, PublicUser, RankingPeriod, RankingRow,
  DataExport, NewPost, ReplyView, SavedWorkout, SyncRequest, SyncResponse,
} from '@sandbag/shared';

// The web app is served beside the API, so it needs no address and no CORS.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '/api';

/** Where the public API lives, for showing people. */
export const apiAddress = () => `${BASE_URL.startsWith('/') ? window.location.origin : ''}${BASE_URL}/v1`;

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: () => void = () => {};

export function configureApi(options: { token: string | null; onUnauthorized?: () => void }): void {
  authToken = options.token;
  if (options.onUnauthorized) onUnauthorized = options.onUnauthorized;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // On the web the session is a cookie this code can't read. The header proves the request came from the app.
  if (Platform.OS === 'web') headers['X-Sandbag-Web'] = '1';
  else if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401 && authToken) onUnauthorized();
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? 'Something went wrong. Try again.');
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const api = {
  register: (input: { username: string; displayName: string; password: string; inviteCode: string }) =>
    request<AuthResponse>('POST', '/auth/register', input),
  login: (input: { username: string; password: string }) => request<AuthResponse>('POST', '/auth/login', input),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<Me>('GET', '/me'),
  updateMe: (input: { displayName?: string; weeklyTarget?: number; avatar?: AvatarId; timeZone?: string }) => request<Me>('PATCH', '/me', input),
  changePassword: (currentPassword: string, newPassword: string) => request<void>('POST', '/me/password', { currentPassword, newPassword }),
  exportData: () => request<DataExport>('GET', '/me/export'),
  deleteAccount: (password: string) => request<void>('DELETE', '/me', { password }),
  sync: (input: SyncRequest) => request<SyncResponse>('POST', '/sync', input),
  feed: (before?: string) => request<PostView[]>('GET', before ? `/feed?before=${encodeURIComponent(before)}` : '/feed'),
  post: (id: string) => request<PostView & { replies: ReplyView[]; calls: CallView[] }>('GET', `/posts/${id}`),
  createPost: (input: NewPost) => request<PostView>('POST', '/posts', input),
  deletePost: (id: string) => request<void>('DELETE', `/posts/${id}`),
  respect: (id: string, on: boolean) => request<void>(on ? 'PUT' : 'DELETE', `/posts/${id}/respect`),
  reply: (id: string, text: string) => request<unknown>('POST', `/posts/${id}/replies`, { text }),
  saveFromPost: (id: string) => request<SavedWorkout>('POST', `/posts/${id}/save`),
  callSandbag: (id: string, exercise: string, line: string) => request<unknown>('POST', `/posts/${id}/calls`, { exercise, line }),
  calls: () => request<CallView[]>('GET', '/calls'),
  rankings: (period: RankingPeriod) => request<RankingRow[]>('GET', `/rankings?period=${period}`),
  friends: () => request<PublicUser[]>('GET', '/friends'),
  addFriend: (inviteCode: string) => request<PublicUser>('POST', '/friends', { inviteCode }),
  removeFriend: (id: string) => request<void>('DELETE', `/friends/${id}`),
  nudge: (id: string) => request<void>('POST', `/friends/${id}/nudge`),
  rotateInviteCode: () => request<{ code: string }>('POST', '/invites/rotate'),
  invites: () => request<InviteSummary>('GET', '/invites'),
  notifications: () => request<NotificationView[]>('GET', '/notifications'),
  markNotificationsRead: () => request<void>('POST', '/notifications/read'),
  registerPushToken: (token: string) => request<void>('PUT', '/me/push-token', { token }),
  webPushKey: () => request<{ key: string }>('GET', '/push/web-key'),
  registerWebPush: (subscription: PushSubscriptionJSON) => request<void>('PUT', '/me/web-push', subscription),
  trophies: () => request<TrophyView[]>('GET', '/trophies'),
  apiKeys: () => request<ApiKeyView[]>('GET', '/me/api-keys'),
  createApiKey: (name: string, password: string) => request<ApiKeyView & { key: string }>('POST', '/me/api-keys', { name, password }),
  deleteApiKey: (id: string) => request<void>('DELETE', `/me/api-keys/${id}`),
};

export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Can’t reach the server. Check your connection.';
}
