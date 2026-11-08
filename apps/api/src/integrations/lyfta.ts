import { BadKey, type Fetcher, type PulledWorkout } from './pull';

// Lyfta's personal API: https://my.lyfta.app/community/api. Read-only, 60 requests a minute and 5,000 a day per key.
const LYFTA = 'https://my.lyfta.app';
const WORKOUTS = '/api/v1/workouts';
/** Lyfta's sample data, in the same shape, with no key needed. For trying imports locally. */
export const LYFTA_SANDBOX = '/api/sandbox/v1/workouts';
const PAGE_SIZE = 100;
/** A first import of 5,000 workouts is plenty, and keeps one account from using the day's requests. */
const MAX_PAGES = 50;
/** Keeps a long history under Lyfta's 60 a minute. */
const PAGE_GAP_MS = 1100;
const TIMEOUT_MS = 20_000;

interface WorkoutPage {
  workouts?: { id?: unknown; workout_perform_date?: unknown }[];
  total_pages?: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function lyftaFetcher({ fetchImpl = fetch, base = LYFTA, path = WORKOUTS, gapMs = PAGE_GAP_MS }: { fetchImpl?: typeof fetch; base?: string; path?: string; gapMs?: number } = {}): Fetcher {
  return {
    async fetchWorkouts(key, since) {
      const found: PulledWorkout[] = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        if (page > 1) await wait(gapMs);
        const url = new URL(path, base);
        url.searchParams.set('limit', String(PAGE_SIZE));
        url.searchParams.set('page', String(page));
        if (since) url.searchParams.set('from', since);
        const response = await fetchImpl(url, {
          headers: { authorization: `Bearer ${key}`, accept: 'application/json', 'user-agent': 'Sandbag workout import' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 401 || response.status === 403) throw new BadKey('Lyfta refused the key');
        if (!response.ok) throw new Error(`Lyfta answered ${response.status}`);
        const body = await response.json() as WorkoutPage;
        const workouts = body.workouts ?? [];
        for (const workout of workouts) {
          const performedAt = new Date(String(workout.workout_perform_date));
          // Anything without an id or a date can't be filed. The shared mapping checks the rest.
          if (workout.id === undefined || workout.id === null || Number.isNaN(performedAt.getTime())) continue;
          found.push({ externalId: String(workout.id), performedAt, payload: workout });
        }
        if (!workouts.length || page >= (body.total_pages ?? page)) break;
      }
      return found;
    },
  };
}
