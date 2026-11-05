import { voice } from '@sandbag/shared';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

const WEB_TITLE = 'Rest over · Sandbag';
let scheduled: string | null = null;
let asked = false;

/** Asked the first time you rest, when it's obvious what it's for, and not again. */
export function askForRestAlert(): void {
  if (Platform.OS === 'web' || asked) return;
  asked = true;
  void Notifications.requestPermissionsAsync().catch(() => {});
}

async function cancel(): Promise<void> {
  const id = scheduled;
  scheduled = null;
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/**
 * Timers stop when the phone locks, so the phone is asked to do the telling. It's only scheduled
 * on the way out of the app and cancelled on the way back in, so it never fires over the rest screen.
 * On the web, a hidden tab's title says so instead. Returns how to stop watching.
 */
export function watchRest(endsAt: number): () => void {
  if (Platform.OS === 'web') {
    const original = document.title;
    const timer = setTimeout(() => {
      if (document.hidden) document.title = WEB_TITLE;
    }, Math.max(0, endsAt - Date.now()));
    const restore = () => {
      if (!document.hidden) document.title = original;
    };
    document.addEventListener('visibilitychange', restore);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', restore);
      if (document.title === WEB_TITLE) document.title = original;
    };
  }
  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      void cancel();
      return;
    }
    const seconds = Math.ceil((endsAt - Date.now()) / 1000);
    if (next !== 'background' || seconds <= 0 || scheduled) return;
    void Notifications.scheduleNotificationAsync({
      content: { title: 'Rest’s over', body: voice.restOver },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    }).then((id) => {
      scheduled = id;
      // Back already, before the phone answered.
      if (AppState.currentState === 'active') void cancel();
    }).catch(() => {});
  });
  return () => {
    subscription.remove();
    void cancel();
  };
}
