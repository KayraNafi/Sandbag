import { Barlow_400Regular, Barlow_600SemiBold } from '@expo-google-fonts/barlow';
import { BarlowCondensed_600SemiBold, BarlowCondensed_800ExtraBold_Italic } from '@expo-google-fonts/barlow-condensed';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { queryClient } from '@/api/queryClient';
import { useSession } from '@/auth/session';
import { stackOptions } from '@/components/header';
import { ToastHost } from '@/components/Toast';
import { ConfirmHost } from '@/components/confirm';
import { useData } from '@/data/store';
import { useSyncLoop } from '@/data/sync';
import { PushBridge } from '@/push/PushBridge';
import { colors } from '@/theme';

export { ErrorBoundary } from 'expo-router';

void SplashScreen.preventAutoHideAsync();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, border: colors.line, primary: colors.volt, text: colors.ink } };

const whenHydrated = () => new Promise<void>((resolve) => {
  if (useData.persist.hasHydrated()) resolve();
  else useData.persist.onFinishHydration(() => resolve());
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Barlow_400Regular, Barlow_600SemiBold, BarlowCondensed_600SemiBold, BarlowCondensed_800ExtraBold_Italic });
  const status = useSession((state) => state.status);
  useSyncLoop();

  useEffect(() => {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
    void whenHydrated().then(() => useSession.getState().restore());
  }, []);

  const ready = fontsLoaded && status !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={stackOptions}>
          <Stack.Protected guard={status === 'signedIn'}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="workout/active" options={{ title: 'Workout', gestureEnabled: false }} />
            <Stack.Screen name="workout/finished" options={{ title: 'Logged', headerBackVisible: false, gestureEnabled: false }} />
            <Stack.Screen name="workout/saved/[id]" options={{ title: 'Saved workout' }} />
            <Stack.Screen name="workout/edit/[id]" options={{ title: 'Edit workout' }} />
            <Stack.Screen name="workout/logged/[id]" options={{ title: 'Session' }} />
            <Stack.Screen name="share" options={{ title: 'Share', presentation: 'modal' }} />
            <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
            <Stack.Screen name="exercise/[key]" options={{ title: 'Progress' }} />
            <Stack.Screen name="history" options={{ title: 'History' }} />
            <Stack.Screen name="exercises" options={{ title: 'All lifts' }} />
            <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
            <Stack.Screen name="invites" options={{ title: 'Bring witnesses' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="avatar" options={{ title: 'Pick your character' }} />
            <Stack.Screen name="trophies" options={{ title: 'Trophies' }} />
            <Stack.Screen name="api-keys" options={{ title: 'API keys' }} />
          </Stack.Protected>
          <Stack.Protected guard={status !== 'signedIn'}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Screen name="about" options={{ title: 'What’s sandbagging?' }} />
        </Stack>
        <ToastHost />
        <ConfirmHost />
        {Platform.OS === 'android' ? <PushBridge /> : null}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
