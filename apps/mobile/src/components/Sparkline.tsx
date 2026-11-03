import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme';
import { EASE_OUT, prefersLessMotion } from './motion';

const PAD = 5;

/** Decorative beside its numbers, which are what a screen reader gets. */
export function Sparkline({ values, width: WIDTH = 84, height: HEIGHT = 36 }: { values: number[]; width?: number; height?: number }) {
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const x = (index: number) => PAD + (index / Math.max(values.length - 1, 1)) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - ((value - low) / span) * (HEIGHT - PAD * 2);
  const path = values.map((value, index) => `${index ? 'L' : 'M'}${x(index)} ${y(value)}`).join(' ');
  const last = values.at(-1) ?? low;
  const shown = useRef(new Animated.Value(prefersLessMotion() ? WIDTH : 0)).current;
  useEffect(() => {
    if (!prefersLessMotion()) Animated.timing(shown, { toValue: WIDTH, duration: 800, delay: 200, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [shown, WIDTH]);
  return (
    <Animated.View style={{ width: shown, height: HEIGHT, overflow: 'hidden' }}>
    <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={path} stroke={colors.chart} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={x(values.length - 1)} cy={y(last)} r={3.5} fill={colors.chart} />
    </Svg>
    </Animated.View>
  );
}
