import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from '@/api/client';
import { queryClient } from '@/api/queryClient';
import { useSession } from '@/auth/session';
import { hrefFor } from '@/domain/routes';

if (Platform.OS === 'android') {
  // Otherwise a notification that arrives with the app open is silently dropped.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function register(): Promise<void> {
  await Notifications.setNotificationChannelAsync('default', { name: 'Everything', importance: Notifications.AndroidImportance.HIGH });
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return;
  const { data } = await Notifications.getDevicePushTokenAsync();
  await api.registerPushToken(String(data));
}

function routeOf(response: Notifications.NotificationResponse): string | undefined {
  const { content, trigger } = response.notification.request;
  // Sent while the app was closed, Firebase's data arrives on the trigger instead.
  const remote = (trigger as { remoteMessage?: { data?: Record<string, string> } } | null)?.remoteMessage?.data;
  return (content.data?.route as string | undefined) ?? remote?.route;
}

/** Android only for now: iPhones need Apple's paid account. Registers once you're signed in, and opens what you tap. */
export function PushBridge() {
  const status = useSession((state) => state.status);
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (status !== 'signedIn') return undefined;
    // Failing here only costs pushes. The in-app list still works, and the next launch retries.
    void register().catch(() => {});
    const refreshed = Notifications.addPushTokenListener(({ data }) => void api.registerPushToken(String(data)).catch(() => {}));
    // A push can mean a new call on you, not just a new inbox row.
    const received = Notifications.addNotificationReceivedListener(() => void queryClient.invalidateQueries({ predicate: ({ queryKey }) => ['notifications', 'calls'].includes(String(queryKey[0])) }));
    return () => {
      refreshed.remove();
      received.remove();
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'signedIn' || !lastResponse) return;
    const href = hrefFor(routeOf(lastResponse));
    if (href) router.push(href);
    void Notifications.clearLastNotificationResponseAsync();
  }, [status, lastResponse]);

  return null;
}
