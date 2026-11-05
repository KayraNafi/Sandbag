import { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import { feel } from '@/components/motion';
import { toast } from '@/components/Toast';
import { colors, fonts, radius } from '@/theme';

const HOLD_MS = 900;
/** Let go this early and it was a tap, which gets told how it works. */
const QUICK_TAP = 0.2;

/** Press and hold to finish: a little ceremony, and no finishing by accident. Screen readers can just activate it. */
export function HoldButton({ title, onDone }: { title: string; onDone: () => void }) {
  const fill = useRef(new Animated.Value(0)).current;
  const finish = useRef(onDone);
  finish.current = onDone;
  const start = () => {
    feel.tap();
    Animated.timing(fill, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) finish.current();
    });
  };
  const stop = () => {
    fill.stopAnimation((value) => {
      if (value >= 1) return;
      if (value < QUICK_TAP) toast('Hold it down. You’ve earned a second.');
      Animated.timing(fill, { toValue: 0, duration: 180, useNativeDriver: false }).start();
    });
  };
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => finish.current()}
      onPressIn={start}
      onPressOut={stop}
      style={styles.hold}
    >
      <Animated.View style={[styles.fill, { width }]} />
      <Text style={styles.text}>{title.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hold: { minHeight: 72, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.volt, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.chart },
  text: { fontFamily: fonts.display, fontSize: 20, color: colors.voltInk },
});
