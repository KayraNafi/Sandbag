import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LoggedWorkout, Me, NewPost, Run, SavedWorkout, SyncResponse } from '@sandbag/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Draft } from '@/domain/history';
import { mergeDocs } from './merge';

/**
 * The phone is the working copy, so logging never waits on the network.
 * Everything changed here is queued for sync.ts to send.
 */
interface DataState {
  logged: Record<string, LoggedWorkout>;
  saved: Record<string, SavedWorkout>;
  runs: Record<string, Run>;
  dirtyLogged: string[];
  dirtySaved: string[];
  dirtyRuns: string[];
  outbox: NewPost[];
  cursor: number;
  draft: Draft | null;
  ownerId: string | null;
  profile: Me | null;
  setProfile: (profile: Me) => void;
  claim: (ownerId: string) => void;
  putLogged: (doc: Omit<LoggedWorkout, 'updatedAt'>) => void;
  putSaved: (doc: Omit<SavedWorkout, 'updatedAt'>) => void;
  putRun: (doc: Omit<Run, 'updatedAt'>) => void;
  setDraft: (draft: Draft | null) => void;
  enqueuePost: (post: NewPost) => void;
  removeFromOutbox: (id: string) => void;
  applySync: (response: SyncResponse, sent: { logged: Map<string, number>; saved: Map<string, number>; runs: Map<string, number> }) => void;
  mergeSaved: (doc: SavedWorkout) => void;
  reset: () => void;
}

const empty = { logged: {}, saved: {}, runs: {}, dirtyLogged: [], dirtySaved: [], dirtyRuns: [], outbox: [], cursor: 0, draft: null, ownerId: null, profile: null };

function withDirty(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

export const useData = create<DataState>()(persist((set) => ({
  ...empty,
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
  putRun: (doc) => set((state) => ({
    runs: { ...state.runs, [doc.id]: { ...doc, updatedAt: Date.now() } },
    dirtyRuns: withDirty(state.dirtyRuns, doc.id),
  })),
  setDraft: (draft) => set({ draft }),
  enqueuePost: (post) => set((state) => ({ outbox: [...state.outbox, post] })),
  removeFromOutbox: (id) => set((state) => ({ outbox: state.outbox.filter((post) => post.id !== id) })),
  applySync: (response, sent) => set((state) => {
    const logged = mergeDocs(state.logged, state.dirtyLogged, response.loggedWorkouts, sent.logged);
    const saved = mergeDocs(state.saved, state.dirtySaved, response.savedWorkouts, sent.saved);
    const runs = mergeDocs(state.runs, state.dirtyRuns, response.runs, sent.runs);
    return {
      logged: logged.docs, dirtyLogged: logged.dirty, saved: saved.docs, dirtySaved: saved.dirty, runs: runs.docs, dirtyRuns: runs.dirty, cursor: response.cursor,
    };
  }),
  mergeSaved: (doc) => set((state) => ({ saved: { ...state.saved, [doc.id]: doc } })),
  reset: () => set(empty),
}), {
  name: 'sandbag.data.v1',
  storage: createJSONStorage(() => AsyncStorage),
  version: 2,
  // Each version fetches everything once more, and merging keeps anything not yet sent. 1 added runs, which an older
  // app on another phone had moved the cursor past. 2 takes the server's copy under the same stamp, which older apps
  // ignored, so lift names fixed on the server (migration 0012) never reached them.
  migrate: (persisted, version) => (version < 2 ? { ...(persisted as object), cursor: 0 } : persisted) as DataState,
}));

export const nextPosition = (saved: Record<string, SavedWorkout>) =>
  Object.values(saved).reduce((max, workout) => Math.max(max, workout.position + 1), 0);
