import AsyncStorage from '@react-native-async-storage/async-storage';
import { exerciseKey } from '@sandbag/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** How a workout is logged: every lift on one list, or one set at a time. */
export type LoggingStyle = 'list' | 'steps';

/** The usual smallest change in weight, with 1.25 kg plates on each side. */
const DEFAULT_JUMP = 2.5;
export const JUMPS = [1, 2, 2.5, 5, 10] as const;

/**
 * Choices about this phone and gym, not about the account. Kept apart from the synced
 * data, so signing out or switching accounts doesn't reset them.
 */
interface PrefsState {
  logging: LoggingStyle;
  /** What + and − move a lift's weight by, per exercise. */
  jumps: Record<string, number>;
  setLogging: (logging: LoggingStyle) => void;
  setJump: (exercise: string, jump: number) => void;
}

export const usePrefs = create<PrefsState>()(persist((set) => ({
  logging: 'list',
  jumps: {},
  setLogging: (logging) => set({ logging }),
  setJump: (exercise, jump) => set((state) => ({ jumps: { ...state.jumps, [exerciseKey(exercise)]: jump } })),
}), {
  name: 'sandbag.prefs.v1',
  storage: createJSONStorage(() => AsyncStorage),
}));

export const jumpFor = (jumps: Record<string, number>, exercise: string) => jumps[exerciseKey(exercise)] ?? DEFAULT_JUMP;
