import { useEffect, useRef } from 'react';
import { Animated, Easing, Keyboard, StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';
import { Button } from '@/components/ui';
import { useData } from '@/data/store';
import { colors, fonts, space } from '@/theme';
import { Icon, type IconName } from './icons';
import { feel, NATIVE, Pop, prefersLessMotion } from './motion';
import { Sheet, sheetsSettled } from './Sheet';

interface ConfirmRequest {
  title: string;
  message: string;
  action: string;
  icon: IconName;
  answer: (sure: boolean) => void;
}

const useConfirm = create<{ request: ConfirmRequest | null }>(() => ({ request: null }));

/** Starting anything replaces the workout in progress, so that gets asked first. */
export async function okToReplaceDraft(): Promise<boolean> {
  const draft = useData.getState().draft;
  if (!draft) return true;
  if (draft.editing) return confirm('Drop these changes?', `You’re still editing ${draft.title}. Starting this loses them.`, 'Start anyway', 'bag');
  if (!draft.entries.some((entry) => entry.done)) return true;
  return confirm(`${draft.title} isn’t finished`, 'Starting this one throws away what you’ve done so far.', 'Start anyway', 'bag');
}

/** Asks before something destructive. Anything but pressing the action counts as no. */
export async function confirm(title: string, message: string, action: string, icon: IconName = 'trash'): Promise<boolean> {
  Keyboard.dismiss();
  useConfirm.getState().request?.answer(false);
  await sheetsSettled();
  return new Promise((resolve) => {
    useConfirm.setState({ request: { title, message, action, icon, answer: resolve } });
  });
}

/** It shudders once when it arrives, so the question reads as a warning before a word of it does. */
function Warning({ icon }: { icon: IconName }) {
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    feel.warn();
    if (prefersLessMotion()) return;
    Animated.sequence([
      Animated.delay(240),
      Animated.timing(shake, { toValue: 1, duration: 420, easing: Easing.linear, useNativeDriver: NATIVE }),
    ]).start();
  }, [shake]);
  const rotate = shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: ['0deg', '-14deg', '12deg', '-8deg', '4deg', '0deg'] });
  return (
    <Pop>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Icon name={icon} size={52} color={colors.danger} />
      </Animated.View>
    </Pop>
  );
}

export function ConfirmHost() {
  const request = useConfirm((state) => state.request);
  // What's on the sheet stays there while it slides away.
  const shown = useRef(request);
  if (request) shown.current = request;
  const look = shown.current;
  const answer = (sure: boolean) => {
    useConfirm.setState({ request: null });
    request?.answer(sure);
  };
  return (
    <Sheet
      uncounted
      visible={Boolean(request)}
      onClose={() => answer(false)}
      footer={look ? (
        <View style={styles.buttons}>
          <Button title="Cancel" variant="ghost" style={styles.cancel} onPress={() => answer(false)} />
          <Button title={look.action} variant="danger" style={styles.action} onPress={() => answer(true)} />
        </View>
      ) : undefined}
    >
      {look ? (
        <View key={look.title} style={styles.body}>
          <Warning icon={look.icon} />
          <Text accessibilityRole="header" style={styles.title}>{look.title}</Text>
          <Text style={styles.message}>{look.message}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm, paddingBottom: space.sm },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.ink },
  message: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, color: colors.ink2 },
  buttons: { flexDirection: 'row', gap: space.sm },
  cancel: { width: 112 },
  action: { flex: 1 },
});
