import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';

/** Line icons on a 24-unit grid, all drawn with the same stroke. Decorative: whatever holds one carries the label. */
const PATHS = {
  bag: 'M8 4h8l1 3c2 2 3 5 3 8 0 4-3 6-8 6s-8-2-8-6c0-3 1-6 3-8zM7 7h10',
  shield: 'M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z',
  reply: 'M4 5h16v11H9l-5 4zM8 9h8M8 12.5h5',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6',
  people: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
  flame: 'M12 3c1 3.5 5.5 6 5.5 11a5.5 5.5 0 0 1-11 0c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 3 0-3.5.5-6.5 1.5-9.5',
  crown: 'M4 18h16M4 15l-1-9 5 4 4-6 4 6 5-4-1 9z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={PATHS[name]} />
    </Svg>
  );
}
