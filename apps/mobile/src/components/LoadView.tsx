import type { Entry, Kit } from '@sandbag/shared';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { num } from '@/domain/format';
import { loadOf } from '@/domain/plates';
import { colors, fonts, space } from '@/theme';
import { EASE_OUT, NATIVE, Pop, prefersLessMotion } from './motion';

const HEIGHT = 76;
const SHOWN_PLATES = 8;
/** Room between the collars: a bar's sleeve, or a dumbbell's handle. */
const GRIP = { bar: 92, dumbbell: 44 } as const;
const STACK_ROWS = 12;
/** What each block in a pin stack stands for. */
const STACK_STEP = 10;
const STACK_DELAY_MS = 35;

const PLATE: Record<number, { height: number; color: string }> = {
  25: { height: 72, color: colors.volt },
  20: { height: 66, color: colors.ink },
  15: { height: 56, color: '#a3c13a' },
  10: { height: 46, color: '#6f7165' },
  5: { height: 34, color: colors.ink2 },
  2.5: { height: 26, color: '#4c4f43' },
  1.25: { height: 20, color: '#34372c' },
};

/** Slides on from the end of the bar, the way a plate actually goes on. */
function Plate({ weight, side, delay }: { weight: number; side: 1 | -1; delay: number }) {
  const slide = useRef(new Animated.Value(prefersLessMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (prefersLessMotion()) return;
    Animated.timing(slide, { toValue: 1, duration: 320, delay, easing: EASE_OUT, useNativeDriver: NATIVE }).start();
  }, [slide, delay]);
  const look = PLATE[weight] ?? PLATE[5]!;
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [side * 46, 0] });
  const opacity = slide.interpolate({ inputRange: [0, 0.3], outputRange: [0, 1], extrapolate: 'clamp' });
  return <Animated.View style={[styles.plate, { height: look.height, backgroundColor: look.color, opacity, transform: [{ translateX }] }]} />;
}

/** A pin in a stack: how a machine shows what's on it. */
function Stack({ weight }: { weight: number }) {
  const lit = Math.max(1, Math.min(STACK_ROWS, Math.round(weight / STACK_STEP)));
  return (
    <View accessible accessibilityLabel={`${num(weight)} kilos on the stack`} style={styles.stack}>
      {Array.from({ length: STACK_ROWS }, (_, row) => {
        const on = row >= STACK_ROWS - lit;
        return (
          <Pop key={row} delay={on ? (STACK_ROWS - row) * STACK_DELAY_MS : 0}>
            <View style={[styles.block, on && styles.blockOn, row === STACK_ROWS - lit && styles.blockPin]} />
          </Pop>
        );
      })}
    </View>
  );
}

/**
 * What a weight looks like in the gym, which a number never quite says: plates on a bar, a dumbbell or a machine's sled,
 * with what goes on each side in words, or the pin in a machine's stack. Nothing for bodyweight.
 */
export function LoadView({ weight, kit, perSide = false, includesEquipment }: { weight: number | null; kit: Kit } & Partial<Pick<Entry, 'perSide' | 'includesEquipment'>>) {
  const load = loadOf(weight, kit, { perSide, includesEquipment });
  if (!load) return null;
  if (load.kind === 'stack') return <Stack weight={load.weight} />;
  const plates = load.plates.slice(0, SHOWN_PLATES);
  return (
    <View accessible accessibilityLabel={load.words ?? `${num(weight!)} kilos`}>
      <View style={styles.bar}>
        <View style={styles.shaft} />
        <View style={styles.plates}>
          {[...plates].reverse().map((plate, index) => <Plate key={`l${index}-${plate}`} weight={plate} side={-1} delay={(plates.length - index) * 70} />)}
          <View style={[styles.collar, { marginRight: GRIP[load.handle] }]} />
          <View style={styles.collar} />
          {plates.map((plate, index) => <Plate key={`r${index}-${plate}`} weight={plate} side={1} delay={(index + 1) * 70} />)}
        </View>
      </View>
      {load.words ? <Text style={styles.words}>{load.words}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  words: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink2, textAlign: 'center' },
  bar: { height: HEIGHT, alignSelf: 'stretch', justifyContent: 'center', marginVertical: space.xs },
  shaft: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: colors.line },
  plates: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  plate: { width: 14, borderRadius: 3 },
  collar: { width: 6, height: 16, borderRadius: 2, backgroundColor: colors.ink3 },
  stack: { alignSelf: 'center', gap: 2, marginVertical: space.xs },
  block: { width: 132, height: 6, borderRadius: 1.5, backgroundColor: colors.surface2 },
  blockOn: { backgroundColor: PLATE[15]!.color },
  blockPin: { backgroundColor: colors.volt },
});
