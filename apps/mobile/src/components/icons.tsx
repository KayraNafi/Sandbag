import type { Equipment } from '@sandbag/shared';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';

const PATHS = {
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2.2 2.2 0 0 0 4 0',
  gear: 'M10.03 4.66L10.05 1.99L13.95 1.99L13.97 4.66L15.80 5.42L17.70 3.54L20.46 6.30L18.58 8.20L19.34 10.03L22.01 10.05L22.01 13.95L19.34 13.97L18.58 15.80L20.46 17.70L17.70 20.46L15.80 18.58L13.97 19.34L13.95 22.01L10.05 22.01L10.03 19.34L8.20 18.58L6.30 20.46L3.54 17.70L5.42 15.80L4.66 13.97L1.99 13.95L1.99 10.05L4.66 10.03L5.42 8.20L3.54 6.30L6.30 3.54L8.20 5.42ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 5l7 7-7 7',
  back: 'M15 5l-7 7 7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  grip: 'M5 8h14M5 12h14M5 16h14',
  shield: 'M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z',
  flame: 'M12 3c1 3.5 5.5 6 5.5 11a5.5 5.5 0 0 1-11 0c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 3 0-3.5.5-6.5 1.5-9.5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6',
  people: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
  bag: 'M8 4h8l1 3c2 2 3 5 3 8 0 4-3 6-8 6s-8-2-8-6c0-3 1-6 3-8zM7 7h10',
  reply: 'M4 5h16v11H9l-5 4zM8 9h8M8 12.5h5',
  key: 'M8 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10M11.5 12.5L20 4M16 8l3 3',
  lock: 'M6 11h12v9H6zM8.5 11V7.5a3.5 3.5 0 1 1 7 0V11',
  download: 'M12 4v11M8 11l4 4 4-4M5 20h14',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13',
  user: 'M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 12h.01',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4M9 9.5h.01M15 9.5h.01',
  crown: 'M4 18h16M4 15l-1-9 5 4 4-6 4 6 5-4-1 9z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={PATHS[name]} />
    </Svg>
  );
}

/** The kit as it looks in the gym, all drawn the same way: solid shapes, lines only for cable. */
export function EquipmentIcon({ type, size = 28, color = colors.ink }: { type: Equipment; size?: number; color?: string }) {
  const line = { stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {type === 'barbell' ? (
        <>
          <Rect x={1} y={14.6} width={30} height={2.8} rx={1.4} fill={color} />
          <Rect x={6} y={6} width={4.4} height={20} rx={1.4} fill={color} />
          <Rect x={21.6} y={6} width={4.4} height={20} rx={1.4} fill={color} />
          <Rect x={2.6} y={10} width={2.6} height={12} rx={1.2} fill={color} />
          <Rect x={26.8} y={10} width={2.6} height={12} rx={1.2} fill={color} />
        </>
      ) : null}
      {type === 'dumbbell' ? (
        <>
          <Rect x={10} y={14.2} width={12} height={3.6} rx={1} fill={color} />
          <Rect x={5} y={8.5} width={6} height={15} rx={2} fill={color} />
          <Rect x={21} y={8.5} width={6} height={15} rx={2} fill={color} />
          <Rect x={1.6} y={11.5} width={2.6} height={9} rx={1.2} fill={color} />
          <Rect x={27.8} y={11.5} width={2.6} height={9} rx={1.2} fill={color} />
        </>
      ) : null}
      {type === 'machine' ? (
        <>
          {/* A weight stack on its cable, with the pin in. */}
          <Circle cx={16} cy={4} r={2.6} {...line} />
          <Path d="M16 6.6V10" {...line} />
          {[10, 15, 20, 25].map((y) => <Rect key={y} x={6} y={y} width={20} height={3.8} rx={1.1} fill={color} />)}
          <Rect x={26} y={15.7} width={4.5} height={2.4} rx={1.2} fill={color} />
        </>
      ) : null}
      {type === 'cable' ? (
        <>
          {/* A pulley, the cable, and a bar to pull. */}
          <Circle cx={16} cy={6} r={4} {...line} />
          <Circle cx={16} cy={6} r={1.2} fill={color} />
          <Path d="M16 10v9M16 19L9 25M16 19l7 6" {...line} />
          <Rect x={3} y={24.2} width={26} height={3.6} rx={1.8} fill={color} />
        </>
      ) : null}
      {type === 'bodyweight' ? (
        // A flexed arm: your own body is the kit, without claiming a pose the lift doesn't use.
        <Path d="M7.5 28.5C5.2 22 5.6 14.6 9.6 8.4L8 5.2c-.4-.8-.1-1.700.7-2.100L12.100 1.500c.5-.2 1-.2 1.500.1l4.300 2.400c.7.4 1 1.200.8 1.900l-1.500 4.900c-.3 1-1 1.500-1.900 1.300l-1.100-.3c-.9 1.200-1.500 2.800-1.600 4.300 3.400-3.600 9.700-3.100 12.700 1.200 3 4.400 1.800 9.900-1.900 12H9.300c-.8 0-1.500-.4-1.800-1.300z" fill={color} />
      ) : null}
    </Svg>
  );
}
