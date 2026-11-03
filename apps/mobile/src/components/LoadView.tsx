import type { Equipment } from '@sandbag/shared';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { plateWords, platesFor } from '@/domain/plates';
import { colors, fonts, space } from '@/theme';
import { EASE_OUT, NATIVE, Pop, prefersLessMotion } from './motion';

const HEIGHT = 76;
const SHOWN_PLATES = 8;
const STACK_ROWS = 12;
const STACK_STEP = 10;

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

function Bar({ plates, centre }: { plates: number[]; centre: number }) {
  const shown = plates.slice(0, SHOWN_PLATES);
  return (
    <View style={styles.bar}>
      <View style={styles.shaft} />
      <View style={styles.plates}>
        {[...shown].reverse().map((weight, index) => <Plate key={index} weight={weight} side={-1} delay={(shown.length - index) * 70} />)}
        <View style={[styles.collar, { marginRight: centre }]} />
        <View style={styles.collar} />
        {shown.map((weight, index) => <Plate key={index} weight={weight} side={1} delay={(index + 1) * 70} />)}
      </View>
    </View>
  );
}

/** A pin in a stack: how a machine shows you what you've got on it. */
function Stack({ weight }: { weight: number }) {
  const lit = Math.max(1, Math.min(STACK_ROWS, Math.round(weight / STACK_STEP)));
  return (
    <View style={styles.stack}>
      {Array.from({ length: STACK_ROWS }, (_, row) => {
        const on = row >= STACK_ROWS - lit;
        return (
          <Pop key={row} delay={on ? (STACK_ROWS - row) * 35 : 0}>
            <View style={[styles.block, on && styles.blockOn, row === STACK_ROWS - lit && styles.blockPin]} />
          </Pop>
        );
      })}
    </View>
  );
}

/** What this weight actually looks like in the gym, which a number never quite tells you. */
export function LoadView({ weight, equipment }: { weight: number; equipment: Equipment | undefined }) {
  if (!weight || !equipment || equipment === 'bodyweight') return null;
  if (equipment === 'machine' || equipment === 'cable') return <Stack weight={weight} />;
  if (equipment === 'dumbbell') return <Bar plates={platesFor(weight, 0)} centre={44} />;
  const words = plateWords(weight);
  return (
    <View>
      <Bar plates={platesFor(weight)} centre={92} />
      {words ? <Text style={styles.words}>{words}</Text> : null}
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
  blockOn: { backgroundColor: '#a3c13a' },
  blockPin: { backgroundColor: colors.volt },
});
