import type { NewPost } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toIsoDate } from '@/domain/format';
import { useData } from './store';

/** A session or a run, the things that can be shown to the crew more than once. */
export type ShownThing = { loggedWorkoutId: string } | { runId: string };

const isAbout = (post: NewPost, thing: ShownThing) =>
  'runId' in thing ? post.kind === 'run' && post.runId === thing.runId : post.kind === 'workout' && post.loggedWorkoutId === thing.loggedWorkoutId;

/**
 * The day you last showed this to the crew, or null if you haven't. A post still waiting to go out counts as today.
 * Offline, only those waiting ones are known.
 */
export function useLastShown(thing: ShownThing | null): string | null {
  const waiting = useData((state) => (thing ? state.outbox.some((post) => isAbout(post, thing)) : false));
  const posted = useQuery({
    queryKey: ['shown', thing],
    queryFn: () => api.postsAbout(thing!),
    enabled: thing !== null,
  });
  if (waiting) return toIsoDate(new Date());
  const last = posted.data?.[0];
  return last ? toIsoDate(new Date(last.createdAt)) : null;
}
