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
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2.2 2.2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  grip: 'M5 8h14M5 12h14M5 16h14',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 12h.01',
  gear: 'M10.03 4.66L10.05 1.99L13.95 1.99L13.97 4.66L15.80 5.42L17.70 3.54L20.46 6.30L18.58 8.20L19.34 10.03L22.01 10.05L22.01 13.95L19.34 13.97L18.58 15.80L20.46 17.70L17.70 20.46L15.80 18.58L13.97 19.34L13.95 22.01L10.05 22.01L10.03 19.34L8.20 18.58L6.30 20.46L3.54 17.70L5.42 15.80L4.66 13.97L1.99 13.95L1.99 10.05L4.66 10.03L5.42 8.20L3.54 6.30L6.30 3.54L8.20 5.42ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  chevron: 'M9 5l7 7-7 7',
  back: 'M20 12H4M10 6l-6 6 6 6',
  user: 'M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  lock: 'M6 11h12v9H6zM8.5 11V7.5a3.5 3.5 0 1 1 7 0V11',
  download: 'M12 4v11M8 11l4 4 4-4M5 20h14',
  key: 'M8 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10M11.5 12.5L20 4M16 8l3 3',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  unfriend: 'M16 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-5A4.5 4.5 0 0 0 2 19.5V21M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 11h6',
  trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={PATHS[name]} />
    </Svg>
  );
}
