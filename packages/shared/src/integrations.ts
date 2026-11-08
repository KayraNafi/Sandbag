import { z } from 'zod';
import type { IntegrationId } from './providers';
import type { LoggedWorkout } from './schemas';

/**
 * Other apps people log in, whose sessions Sandbag copies in. Each one is a provider: what it's called, what
 * settings it needs, and how one of its workouts becomes a Sandbag session. The providers are listed in
 * providers.ts. Fetching lives on the server (apps/api/src/integrations), the one part that talks to them.
 */
export interface IntegrationProvider<Settings = unknown> {
  name: string;
  /** Where someone gets the key to paste in, and what to do there. */
  keyUrl: string;
  keyHelp: string;
  settingsSchema: z.ZodType<Settings>;
  /** One of the provider's workouts, as it sent it, as a session. Null when there's nothing to log, or it can't be read. */
  toWorkout(payload: unknown, settings: Settings, timeZone: string | null): Omit<LoggedWorkout, 'updatedAt'> | null;
}

/** Every imported session is stored under this, so importing it again replaces it instead of adding a copy. */
export const importedWorkoutId = (provider: string, externalId: string) => `${provider}-${externalId}`;

/** connecting: waiting on the first import. bad_key: the provider turned the key down. failing: it couldn't be reached lately. */
export type IntegrationStatus = 'connecting' | 'ok' | 'bad_key' | 'failing';

export interface IntegrationView {
  provider: IntegrationId;
  settings: unknown;
  status: IntegrationStatus;
  syncedAt: string | null;
  /** Sessions it has brought in so far. */
  imported: number;
}

/** What the integrations screen gets: which apps this server can import from, and the ones connected. */
export interface IntegrationsResponse {
  available: IntegrationId[];
  connected: IntegrationView[];
}

/** Connecting: the provider's key, pasted in, and its settings, checked against the provider's own schema on the server. */
export const connectIntegrationSchema = z.object({
  key: z.string().trim().min(8).max(300).regex(/^\S+$/, 'That doesn’t look like a key'),
  settings: z.unknown(),
});

/** Disconnecting can take its sessions with it, or leave them in History. */
export const disconnectIntegrationSchema = z.object({ removeWorkouts: z.boolean().default(false) });
