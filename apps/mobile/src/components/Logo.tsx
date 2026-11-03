import Svg, { Defs, G, Mask, Path, Polygon, Rect } from 'react-native-svg';
import { colors } from '@/theme';

/** Same drawing as assets/logo.svg: a training sandbag, handles up. */
export function Logo({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Sandbag logo">
      <Defs>
        <Mask id="cuts" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <Rect width="1024" height="1024" fill="#fff" />
          <Rect x="244" y="356" width="18" height="372" fill="#000" />
          <Rect x="762" y="356" width="18" height="372" fill="#000" />
          <Polygon points="386,437 462,437 402,647 326,647" fill="#000" />
          <Polygon points="504,437 580,437 520,647 444,647" fill="#000" />
          <Polygon points="622,437 698,437 638,647 562,647" fill="#000" />
        </Mask>
      </Defs>
      {/* Rotated about its centre in SVG's own terms: an origin prop becomes an invalid DOM attribute on the web. */}
      <G transform="rotate(-9 512 512)">
        <Path d="M300 372C300 262 440 262 440 372" fill="none" stroke={colors.volt} strokeWidth={40} />
        <Path d="M584 372C584 262 724 262 724 372" fill="none" stroke={colors.volt} strokeWidth={40} />
        <Rect x="110" y="356" width="804" height="372" rx="120" fill={colors.volt} mask="url(#cuts)" />
      </G>
    </Svg>
  );
}
