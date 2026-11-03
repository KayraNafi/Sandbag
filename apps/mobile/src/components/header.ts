import { colors, fonts } from '@/theme';

export const stackOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.ink,
  headerShadowVisible: false,
  headerTitleStyle: { fontFamily: fonts.label, fontSize: 18 },
  contentStyle: { backgroundColor: colors.bg },
  headerBackButtonDisplayMode: 'minimal',
  headerBackTitle: 'Back',
} as const;
