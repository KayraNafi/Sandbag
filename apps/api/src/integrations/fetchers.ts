import type { IntegrationId } from '@sandbag/shared';
import { lyftaFetcher } from './lyfta';
import type { Fetcher } from './pull';

/** One per provider in packages/shared/src/providers.ts. The type won't build while one is missing. */
export const FETCHERS: Record<IntegrationId, Fetcher> = {
  lyfta: lyftaFetcher(),
};
