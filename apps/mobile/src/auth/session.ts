import type { AuthResponse, Me } from '@sandbag/shared';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { api, configureApi } from '@/api/client';
import { useData } from '@/data/store';

const TOKEN_KEY = 'sandbag.token';

// The Keychain/Keystore on phones. On the web the real session is an HttpOnly cookie,
// so this only remembers that you're signed in, for opening the app offline.
const COOKIE_SESSION = 'cookie';
const tokenStore = Platform.OS === 'web'
  ? {
    get: async () => globalThis.localStorage?.getItem(TOKEN_KEY) ?? null,
    set: async () => globalThis.localStorage?.setItem(TOKEN_KEY, COOKIE_SESSION),
    clear: async () => globalThis.localStorage?.removeItem(TOKEN_KEY),
  }
  : {
    get: () => SecureStore.getItemAsync(TOKEN_KEY),
    set: (value: string) => SecureStore.setItemAsync(TOKEN_KEY, value),
    clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  };

interface SessionState {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  restore: () => Promise<void>;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  setMe: (me: Me) => void;
  refreshMe: () => Promise<void>;
}

function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export const useSession = create<SessionState>((set, get) => {
  // Your week ends at your midnight, so the server needs to know where that is.
  const shareZone = (me: Me) => {
    const timeZone = deviceZone();
    if (timeZone && timeZone !== me.timeZone) void api.updateMe({ timeZone }).then((updated) => get().setMe(updated)).catch(() => {});
  };

  const endSession = async () => {
    await tokenStore.clear();
    configureApi({ token: null });
    set({ status: 'signedOut', me: null });
  };

  return {
    status: 'loading',
    me: null,
    restore: async () => {
      const token = await tokenStore.get();
      configureApi({ token, onUnauthorized: () => void endSession() });
      if (!token) {
        set({ status: 'signedOut' });
        return;
      }
      // Signed-in stays signed-in offline: the workout log has to work at the gym.
      set({ status: 'signedIn', me: useData.getState().profile });
      api.me().then((me) => {
        useData.getState().claim(me.id);
        useData.getState().setProfile(me);
        set({ me });
        shareZone(me);
      }).catch(() => {});
    },
    signIn: async ({ token, user }) => {
      await tokenStore.set(token);
      configureApi({ token: await tokenStore.get() });
      useData.getState().claim(user.id);
      useData.getState().setProfile(user);
      set({ status: 'signedIn', me: user });
      shareZone(user);
    },
    signOut: async () => {
      await api.logout().catch(() => {});
      useData.getState().reset();
      await endSession();
    },
    setMe: (me) => {
      if (get().status !== 'signedIn') return;
      useData.getState().setProfile(me);
      set({ me });
    },
    // Some of what the streak depends on, like a pause your crew approved, only lives on the
    // server. And this catches a phone that opened offline, or has since crossed a time zone.
    refreshMe: async () => {
      const me = await api.me();
      if (JSON.stringify(me) !== JSON.stringify(get().me)) get().setMe(me);
      shareZone(me);
    },
  };
});

/** Ends the session after the server has already deleted the account. */
export async function forgetSession(): Promise<void> {
  await tokenStore.clear();
  configureApi({ token: null });
  useData.getState().reset();
  useSession.setState({ status: 'signedOut', me: null });
}
