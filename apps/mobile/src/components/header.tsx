import { Platform, Pressable } from 'react-native';
import { leave } from '@/nav';
import { colors, fonts } from '@/theme';
import { Icon } from './icons';

/**
 * On the web a reload forgets the pages behind this one, and the stack then hides its arrow,
 * leaving you stuck. This arrow always shows: back when there's a page behind, Home when not.
 */
function WebBack() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={leave} style={{ width: 44, height: 44, marginLeft: 6, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="back" size={24} />
    </Pressable>
  );
}

export const stackOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.ink,
  headerShadowVisible: false,
  headerTitleStyle: { fontFamily: fonts.label, fontSize: 18 },
  contentStyle: { backgroundColor: colors.bg },
  headerBackButtonDisplayMode: 'minimal',
  // Hidden by the minimal look, but it's what screen readers say for the arrow.
  headerBackTitle: 'Back',
  ...(Platform.OS === 'web' ? { headerLeft: () => <WebBack /> } : {}),
} as const;
