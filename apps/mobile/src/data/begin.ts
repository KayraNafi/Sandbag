import { router } from 'expo-router';
import type { SavedWorkout } from '@sandbag/shared';
import { confirm } from '@/components/confirm';
import { startFromSaved } from './actions';
import { useData } from './store';

/** Starting anything replaces the workout in progress, so that gets asked first. Nothing done yet means nothing to lose. */
async function okToReplaceDraft(): Promise<boolean> {
  const draft = useData.getState().draft;
  if (!draft) return true;
  if (draft.editing) return confirm('Drop your changes?', `You’re still editing ${draft.title}. Starting this loses the changes.`, 'Start anyway');
  if (!draft.entries.some((entry) => entry.done)) return true;
  return confirm(`${draft.title} isn’t finished`, 'Starting this one throws away the sets you’ve done.', 'Start anyway');
}

/** Opens the workout screen on a new draft, once it's safe to replace the old one. */
export async function begin(start: () => void): Promise<void> {
  if (!(await okToReplaceDraft())) return;
  start();
  router.push('/workout/active');
}

/** A saved workout already under way is carried on with, not started again. */
export function beginSaved(workout: SavedWorkout): Promise<void> {
  const draft = useData.getState().draft;
  if (draft && !draft.editing && draft.savedWorkoutId === workout.id) {
    router.push('/workout/active');
    return Promise.resolve();
  }
  return begin(() => startFromSaved(workout));
}
