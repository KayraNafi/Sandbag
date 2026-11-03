import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme';

export const NATIVE = Platform.OS !== 'web';
export const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);

let reduced = false;
void AccessibilityInfo.isReduceMotionEnabled?.().then((value) => {
  reduced = value;
}).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
  reduced = value;
});

/** Someone who asked for less motion gets the end state straight away. */
export const prefersLessMotion = () => reduced;

export const feel = {
  tap: () => {
    if (NATIVE) void Haptics.selectionAsync().catch(() => {});
  },
  tick: () => {
    if (NATIVE) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  win: () => {
    if (NATIVE) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warn: () => {
    if (NATIVE) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};

/** Arrives once: a short rise and fade, with no bounce. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(prefersLessMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (prefersLessMotion()) return;
    Animated.timing(progress, { toValue: 1, duration: 320, delay, easing: EASE_OUT, useNativeDriver: NATIVE }).start();
  }, [progress, delay]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return <Animated.View style={[{ opacity: progress, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

/** Springs into place. For small wins: a ticked set, a lit day. */
export function Pop({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(prefersLessMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (prefersLessMotion()) return;
    Animated.timing(progress, { toValue: 1, duration: 300, delay, easing: Easing.back(2.2), useNativeDriver: NATIVE }).start();
  }, [progress, delay]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const opacity = progress.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' });
  return <Animated.View style={[{ opacity, transform: [{ scale }] }, style]}>{children}</Animated.View>;
}

const PIECES = Array.from({ length: 28 }, (_, index) => {
  // The golden angle, so the pieces spread evenly without looking like a pattern.
  const angle = index * 2.39996;
  const reach = 90 + (index * 37) % 110;
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, size: 7 + (index * 5) % 8, turn: `${(index * 53) % 360}deg`, white: index % 4 === 0 };
});

/** Plates flying off the bar. Change `fire` to set it off. Draws nothing the rest of the time. */
export function Burst({ fire, big = false, spread = 1 }: { fire: number; big?: boolean; spread?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!fire || prefersLessMotion()) return;
    setLive(true);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: big ? 1100 : 720, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }).start(({ finished }) => {
      if (finished) setLive(false);
    });
  }, [fire, big, progress]);
  if (!live) return null;
  const pieces = big ? PIECES : PIECES.slice(0, 14);
  const opacity = progress.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] });
  return (
    <View pointerEvents="none" style={burst.host}>
      {pieces.map((piece, index) => {
        const far = big ? spread * 1.5 : spread;
        const transform = [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, piece.x * far] }) },
          // Out, then falling, so they read as thrown rather than exploding in space.
          { translateY: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, piece.y * far * 0.8, piece.y * far + 70 * far] }) },
          { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', piece.turn] }) },
        ];
        return <Animated.View key={index} style={[burst.piece, piece.white && burst.white, { width: piece.size, height: piece.size / 2, opacity, transform }]} />;
      })}
    </View>
  );
}

const burst = StyleSheet.create({
  host: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute', backgroundColor: colors.volt },
  white: { backgroundColor: colors.ink },
});

/** Lands hard, like a rubber stamp. */
export function Stamp({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(prefersLessMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (prefersLessMotion()) return;
    Animated.timing(progress, { toValue: 1, duration: 220, delay, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [progress, delay]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] });
  return <Animated.View style={[{ opacity: progress, transform: [{ scale }, { rotate: '-4deg' }] }, style]}>{children}</Animated.View>;
}
