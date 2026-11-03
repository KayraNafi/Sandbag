import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LoggedWorkout, Me, SavedWorkout, SyncResponse } from '@sandbag/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { NewPost } from '@/api/client';
import { withJump, type Draft, type WeightJumps } from '@/domain/history';

/**
 * The phone is the working copy, so logging never waits on the network.
 * Everything changed here is queued for sync.ts to send.
 */
interface DataState {
  logged: Record<string, LoggedWorkout>;
  saved: Record<string, SavedWorkout>;
  dirtyLogged: string[];
  dirtySaved: string[];
  outbox: NewPost[];
  cursor: number;
  draft: Draft | null;
  ownerId: string | null;
  profile: Me | null;
  /** The rules have been shown on this phone. */
  seenWelcome: boolean;
  setSeenWelcome: () => void;
  /** What each lift can actually go up by at this person's gym. It belongs to the gym, so it stays on the phone. */
  weightJumps: WeightJumps;
  setWeightJump: (name: string, jump: number) => void;
  /** The Monday of the last week whose recap was opened. */
  recapSeen: string | null;
  setRecapSeen: (monday: string) => void;
  setProfile: (profile: Me) => void;
  claim: (ownerId: string) => void;
  putLogged: (doc: Omit<LoggedWorkout, 'updatedAt'>) => void;
  putSaved: (doc: Omit<SavedWorkout, 'updatedAt'>) => void;
  setDraft: (draft: Draft | null) => void;
  enqueuePost: (post: NewPost) => void;
  removeFromOutbox: (id: string) => void;
  applySync: (response: SyncResponse, sent: { logged: Map<string, number>; saved: Map<string, number> }) => void;
  mergeSaved: (doc: SavedWorkout) => void;
  reset: () => void;
}

const empty = { logged: {}, saved: {}, dirtyLogged: [], dirtySaved: [], outbox: [], cursor: 0, draft: null, ownerId: null, profile: null, recapSeen: null };

function withDirty(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

/** A newer local edit made while a request was in flight must stay queued. */
function mergeDocs<T extends { id: string; updatedAt: number }>(
  local: Record<string, T>, dirty: string[], incoming: T[], sent: Map<string, number>,
): { docs: Record<string, T>; dirty: string[] } {
  const docs = { ...local };
  for (const doc of incoming) {
    const mine = docs[doc.id];
    if (!mine || doc.updatedAt > mine.updatedAt) docs[doc.id] = doc;
  }
  return {
    docs,
    dirty: dirty.filter((id) => {
      const stamp = sent.get(id);
      return stamp === undefined || docs[id]?.updatedAt !== stamp;
    }),
  };
}

export const useData = create<DataState>()(persist((set) => ({
  ...empty,
  seenWelcome: false,
  setSeenWelcome: () => set({ seenWelcome: true }),
  weightJumps: {},
  setWeightJump: (name, jump) => set((state) => ({ weightJumps: withJump(state.weightJumps, name, jump) })),
  recapSeen: null,
  setRecapSeen: (monday) => set({ recapSeen: monday }),
  // An expired session keeps unsynced work for the same person; anyone else starts clean.
  claim: (ownerId) => set((state) => (state.ownerId === ownerId ? state : { ...empty, ownerId })),
  setProfile: (profile) => set({ profile }),
  putLogged: (doc) => set((state) => ({
    logged: { ...state.logged, [doc.id]: { ...doc, updatedAt: Date.now() } },
    dirtyLogged: withDirty(state.dirtyLogged, doc.id),
  })),
  putSaved: (doc) => set((state) => ({
    saved: { ...state.saved, [doc.id]: { ...doc, updatedAt: Date.now() } },
    dirtySaved: withDirty(state.dirtySaved, doc.id),
  })),
  setDraft: (draft) => set({ draft }),
  enqueuePost: (post) => set((state) => ({ outbox: [...state.outbox, post] })),
  removeFromOutbox: (id) => set((state) => ({ outbox: state.outbox.filter((post) => post.id !== id) })),
  applySync: (response, sent) => set((state) => {
    const logged = mergeDocs(state.logged, state.dirtyLogged, response.loggedWorkouts, sent.logged);
    const saved = mergeDocs(state.saved, state.dirtySaved, response.savedWorkouts, sent.saved);
    return { logged: logged.docs, dirtyLogged: logged.dirty, saved: saved.docs, dirtySaved: saved.dirty, cursor: response.cursor };
  }),
  mergeSaved: (doc) => set((state) => ({ saved: { ...state.saved, [doc.id]: doc } })),
  reset: () => set(empty),
}), {
  name: 'sandbag.data.v1',
  storage: createJSONStorage(() => AsyncStorage),
}));

export const nextPosition = (saved: Record<string, SavedWorkout>) =>
  Object.values(saved).reduce((max, workout) => Math.max(max, workout.position + 1), 0);
