import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme';

const WIDTH = 84;
const HEIGHT = 36;
const PAD = 5;

/** Decorative beside its numbers, which are what a screen reader gets. */
export function Sparkline({ values }: { values: number[] }) {
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const x = (index: number) => PAD + (index / Math.max(values.length - 1, 1)) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - ((value - low) / span) * (HEIGHT - PAD * 2);
  const path = values.map((value, index) => `${index ? 'L' : 'M'}${x(index)} ${y(value)}`).join(' ');
  const last = values.at(-1) ?? low;
  return (
    <Svg width={WIDTH} height={HEIGHT}>
      <Path d={path} stroke={colors.chart} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={x(values.length - 1)} cy={y(last)} r={3.5} fill={colors.chart} />
    </Svg>
  );
}
