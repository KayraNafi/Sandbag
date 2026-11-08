import { type IntegrationProvider } from './integrations';
import { fromLyfta, lyftaSettingsSchema, lyftaWorkoutSchema } from './lyfta';

/** Every app Sandbag can import from. Adding one: its file beside lyfta.ts, an entry here, and a fetcher on the server. */
const define = <Settings>(provider: IntegrationProvider<Settings>) => provider as IntegrationProvider;

export const INTEGRATIONS = {
  lyfta: define({
    name: 'Lyfta',
    keyUrl: 'https://my.lyfta.app/community/api',
    keyHelp: 'Sign in to Lyfta on the web, open Community, then API, and generate a key. Making a new one there stops the old one.',
    settingsSchema: lyftaSettingsSchema,
    toWorkout: (payload, settings, timeZone) => {
      const workout = lyftaWorkoutSchema.safeParse(payload);
      return workout.success ? fromLyfta(workout.data, settings.unit, timeZone) : null;
    },
  }),
} satisfies Record<string, IntegrationProvider>;

export type IntegrationId = keyof typeof INTEGRATIONS;
export const INTEGRATION_IDS = Object.keys(INTEGRATIONS) as IntegrationId[];
export const isIntegrationId = (value: string): value is IntegrationId => Object.hasOwn(INTEGRATIONS, value);

