import { keepSupersets, voice } from '@sandbag/shared';
import { router } from 'expo-router';
import { confirm } from '@/components/confirm';
import { feel } from '@/components/motion';
import { toast } from '@/components/Toast';
import { addExerciseToDraft, finishDraft } from '@/data/actions';
import { useData } from '@/data/store';
import { moveTo, type Draft, type DraftEntry } from '@/domain/history';
import { leave } from '@/nav';

/** What both logging layouts do to a workout. They differ only in how it's shown. */
export function useWorkout(draft: Draft) {
  const setDraft = useData((state) => state.setDraft);
  const entries = draft.entries;
  return {
    done: entries.filter((entry) => entry.done).length,
    update: (id: string, changes: Partial<DraftEntry>) =>
      setDraft({ ...draft, entries: entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) }),
    /** Supersets the lift at this place with the one after it, or splits them. */
    link: (at: number, on: boolean) =>
      setDraft({ ...draft, entries: entries.map((entry, place) => (place === at ? { ...entry, supersetWithNext: on || undefined } : entry)) }),
    remove: (id: string) => setDraft({ ...draft, entries: keepSupersets(entries, (entry) => entry.id !== id) }),
    move: (from: number, to: number) => setDraft({ ...draft, entries: moveTo(entries, from, to) }),
    rename: (title: string) => setDraft({ ...draft, title }),
    redate: (date: string) => setDraft({ ...draft, date }),
    /** Returns the new lift's id. */
    add: (name: string): string | null => {
      if (!name.trim()) return null;
      const next = addExerciseToDraft(draft, name);
      setDraft(next);
      return next.entries.at(-1)?.id ?? null;
    },
    finish: () => {
      if (!entries.some((entry) => entry.done)) {
        toast('Nothing’s ticked. Bold way to log a workout.');
        return;
      }
      feel.win();
      const workout = finishDraft(draft);
      router.replace(`/workout/finished?id=${workout.id}`);
    },
    discard: async () => {
      const message = draft.editing ? 'Your changes will be lost. The logged session stays.' : voice.discard();
      if (await confirm('Discard this workout?', message, 'Discard')) {
        setDraft(null);
        leave();
      }
    },
  };
}
