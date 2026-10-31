import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts } from '@/theme';

const BAR_HEIGHT = 62;

const ICONS = {
  train: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  crew: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
  rankings: 'M8 21V11H3v10zM15 21V4H9v17zM21 21v-7h-5v7z',
  you: 'M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
};

const icon = (name: keyof typeof ICONS) => function TabIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={String(color)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={ICONS[name]} />
    </Svg>
  );
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.volt,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line, height: BAR_HEIGHT + insets.bottom, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: fonts.label, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Train', tabBarLabel: 'TRAIN', tabBarIcon: icon('train') }} />
      <Tabs.Screen name="crew" options={{ title: 'Crew', tabBarLabel: 'CREW', tabBarIcon: icon('crew') }} />
      <Tabs.Screen name="rankings" options={{ title: 'Rankings', tabBarLabel: 'RANKINGS', tabBarIcon: icon('rankings') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarLabel: 'YOU', tabBarIcon: icon('you') }} />
    </Tabs>
  );
}
