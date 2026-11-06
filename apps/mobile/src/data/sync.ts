import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { ApiError, api } from '@/api/client';
import { useSession } from '@/auth/session';
import { queryClient } from '@/api/queryClient';
import { useData } from './store';

const BATCH = 200;
const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 400;

export const useSyncStatus = create<{ online: boolean | null }>(() => ({ online: null }));

let running = false;
let queued = false;

export async function syncNow(): Promise<void> {
  if (useSession.getState().status !== 'signedIn') return;
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    let more = true;
    while (more) {
      const state = useData.getState();
      const loggedIds = state.dirtyLogged.slice(0, BATCH);
      const savedIds = state.dirtySaved.slice(0, BATCH);
      const runIds = state.dirtyRuns.slice(0, BATCH);
      const logged = loggedIds.flatMap((id) => state.logged[id] ?? []);
      const saved = savedIds.flatMap((id) => state.saved[id] ?? []);
      const runs = runIds.flatMap((id) => state.runs[id] ?? []);
      const response = await api.sync({ cursor: state.cursor, loggedWorkouts: logged, savedWorkouts: saved, runs });
      if (logged.length || saved.length || runs.length || response.loggedWorkouts.length || response.savedWorkouts.length || response.runs.length) {
        // Rankings and call verdicts are computed from what just arrived.
        void queryClient.invalidateQueries({ predicate: ({ queryKey }) => ['rankings', 'calls', 'notifications', 'trophies'].includes(String(queryKey[0])) });
      }
      useData.getState().applySync(response, {
        logged: new Map(logged.map((doc) => [doc.id, doc.updatedAt])),
        saved: new Map(saved.map((doc) => [doc.id, doc.updatedAt])),
        runs: new Map(runs.map((doc) => [doc.id, doc.updatedAt])),
      });
      more = loggedIds.length === BATCH || savedIds.length === BATCH || runIds.length === BATCH;
    }
    await flushOutbox();
    useSyncStatus.setState({ online: true });
  } catch (error) {
    // A server refusal is not being offline; either way the data stays queued.
    if (!(error instanceof ApiError)) useSyncStatus.setState({ online: false });
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void syncNow();
    }
  }
}

async function flushOutbox(): Promise<void> {
  for (const post of useData.getState().outbox) {
    try {
      // Posts carry a client id, so a retry after a lost response can't duplicate.
      await api.createPost(post);
    } catch (error) {
      // A refused post will never succeed, and shouldn't block the ones behind it.
      if (error instanceof ApiError && error.status < 500 && error.status !== 401 && error.status !== 429) {
        useData.getState().removeFromOutbox(post.id);
        continue;
      }
      throw error;
    }
    useData.getState().removeFromOutbox(post.id);
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  }
}

/** Keeps data moving while the app is open: on launch, on change, on return, and on a timer. */
export function useSyncLoop(): void {
  const status = useSession((state) => state.status);

  useEffect(() => {
    if (status !== 'signedIn') return undefined;
    void syncNow();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useData.subscribe((state, previous) => {
      const changed = state.dirtyLogged !== previous.dirtyLogged || state.dirtySaved !== previous.dirtySaved || state.dirtyRuns !== previous.dirtyRuns || state.outbox !== previous.outbox;
      if (!changed || !(state.dirtyLogged.length || state.dirtySaved.length || state.dirtyRuns.length || state.outbox.length)) return;
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
    });
    const interval = setInterval(() => void syncNow(), INTERVAL_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void syncNow();
      // Calls and the inbox change without any sync, so reload them on every return, however fresh they look.
      void queryClient.invalidateQueries({ predicate: ({ queryKey }) => ['calls', 'notifications'].includes(String(queryKey[0])) });
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
      clearInterval(interval);
      appState.remove();
    };
  }, [status]);
}
