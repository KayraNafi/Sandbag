import type { TrophyView } from '@sandbag/shared';
import { useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { formatDate } from '@/domain/format';
import { colors, fonts, space } from '@/theme';
import { Burst, feel, Pop, Stamp } from './motion';
import { Sheet } from './Sheet';
import { Muted, Segments } from './ui';

const RING_RADIUS = 44;
const RING_AROUND = 2 * Math.PI * RING_RADIUS;

// Each drawn on a 24 grid, so they sit in the middle of the medal the same way.
const GLYPHS: Record<string, string> = {
  showed_up: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  actually_tried: 'M12 20V5M6 11l6-6 6 6M5 21h14',
  not_guilty: 'M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  caught: 'M8 4h8l1 3c2 2 3 5 3 8 0 4-3 6-8 6s-8-2-8-6c0-3 1-6 3-8zM7 7h10',
  good_eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  repeat_offender: 'M5 6v12M9 6v12M13 6v12M17 6v12M3 16L19 8',
  four_weeks: 'M4 19V14M9 19V10M14 19V7M19 19V4',
  crew_leader: 'M4 18h16M4 15l-1-9 5 4 4-6 4 6 5-4-1 9z',
};
const PEOPLE = 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6';

/** A medal with a ribbon. Not earned yet, it's dark, and the ring around it fills as you get closer. */
export function Medal({ id, earned, progress = 0, size = 88 }: { id: string; earned: boolean; progress?: number; size?: number }) {
  const glyph = GLYPHS[id] ?? PEOPLE;
  const scope = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={(size * 124) / 100} viewBox="0 0 100 124">
      <Defs>
        <RadialGradient id={`${scope}lit`} cx="0.38" cy="0.3" r="0.85">
          <Stop offset="0" stopColor="#f0ff9a" />
          <Stop offset="0.55" stopColor={colors.volt} />
          <Stop offset="1" stopColor="#7c932b" />
        </RadialGradient>
        <RadialGradient id={`${scope}dark`} cx="0.38" cy="0.3" r="0.85">
          <Stop offset="0" stopColor="#34372c" />
          <Stop offset="1" stopColor="#191b13" />
        </RadialGradient>
        <LinearGradient id={`${scope}ribbon`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#a3c13a" />
          <Stop offset="1" stopColor="#5f7126" />
        </LinearGradient>
      </Defs>
      <Path d="M32 84L22 120L38 111L47 122L52 92Z" fill={earned ? `url(#${scope}ribbon)` : colors.surface2} />
      <Path d="M68 84L78 120L62 111L53 122L48 92Z" fill={earned ? `url(#${scope}ribbon)` : colors.surface2} />
      <Circle cx={50} cy={50} r={RING_RADIUS + 3} fill={colors.surface} />
      {earned ? null : (
        <>
          <Circle cx={50} cy={50} r={RING_RADIUS} fill="none" stroke={colors.line} strokeWidth={5} />
          {progress > 0 ? (
            <Circle
              cx={50}
              cy={50}
              r={RING_RADIUS}
              fill="none"
              stroke={colors.volt}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={RING_AROUND}
              strokeDashoffset={RING_AROUND * (1 - Math.min(1, progress))}
              transform="rotate(-90 50 50)"
            />
          ) : null}
        </>
      )}
      <Circle cx={50} cy={50} r={earned ? 45 : 38} fill={`url(#${scope}${earned ? 'lit' : 'dark'})`} />
      {earned ? (
        <>
          <Circle cx={50} cy={50} r={37} fill={colors.bg} />
          <Path d="M24 38C28 28 38 21 50 21" fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeWidth={2.4} strokeLinecap="round" />
        </>
      ) : null}
      <G transform="translate(22 22) scale(2.34)">
        <Path d={glyph} fill="none" stroke={earned ? colors.volt : colors.ink3} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

const ratio = (trophy: TrophyView) => trophy.progress / Math.max(1, trophy.goal);

/** Earned first, then whatever's closest. */
const sortTrophies = (trophies: TrophyView[]) => [...trophies].sort((a, b) =>
  Number(Boolean(b.earnedAt)) - Number(Boolean(a.earnedAt)) || ratio(b) - ratio(a));

/** The closest one you haven't got. Having one thing to go for beats a list of eleven. */
export function NextTrophy({ trophies, onOpen }: { trophies: TrophyView[]; onOpen: (trophy: TrophyView) => void }) {
  const next = sortTrophies(trophies).find((trophy) => !trophy.earnedAt);
  if (!next) return <Text style={styles.allDone}>THE WHOLE CASE. GO OUTSIDE.</Text>;
  const left = next.goal - next.progress;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Next trophy: ${next.name}. ${next.detail}.`} onPress={() => { feel.tap(); onOpen(next); }} style={styles.next}>
      <Pop><Medal id={next.id} earned={false} progress={ratio(next)} size={84} /></Pop>
      <View style={styles.nextText}>
        <Text style={styles.nextLabel}>NEXT UP</Text>
        <Text style={styles.nextName}>{next.name.toUpperCase()}</Text>
        <Muted>{next.goal > 1 ? `${left} more to go. ${next.detail}.` : `${next.detail}.`}</Muted>
      </View>
    </Pressable>
  );
}

/** The shelf: pick one up to read it. */
export function TrophyGrid({ trophies, limit, onOpen }: { trophies: TrophyView[]; limit?: number; onOpen: (trophy: TrophyView) => void }) {
  const shown = sortTrophies(trophies).slice(0, limit ?? trophies.length);
  return (
    <View style={styles.grid}>
      {shown.map((trophy, index) => (
        <Pressable
          key={trophy.id}
          accessibilityRole="button"
          accessibilityLabel={`${trophy.name}, ${trophy.earnedAt ? 'earned' : `${trophy.progress} of ${trophy.goal}`}`}
          onPress={() => { feel.tap(); onOpen(trophy); }}
          style={styles.cell}
        >
          <Pop delay={Math.min(index, 8) * 55}><Medal id={trophy.id} earned={Boolean(trophy.earnedAt)} progress={ratio(trophy)} size={82} /></Pop>
          <Text numberOfLines={2} style={[styles.cellName, trophy.earnedAt ? styles.cellNameLit : null]}>{trophy.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** One trophy, held up to the light. */
export function TrophySheet({ trophy, onClose }: { trophy: TrophyView | null; onClose: () => void }) {
  const [shown, setShown] = useState<TrophyView | null>(null);
  if (trophy && trophy !== shown) setShown(trophy);
  const item = trophy ?? shown;
  return (
    <Sheet visible={Boolean(trophy)} onClose={onClose}>
      {item ? (
        <View style={styles.sheet}>
          {item.earnedAt ? <Burst fire={trophy ? 1 : 0} big /> : null}
          {item.earnedAt
            ? <Stamp key={item.id} delay={80}><Medal id={item.id} earned size={148} /></Stamp>
            : <Pop key={item.id}><Medal id={item.id} earned={false} progress={ratio(item)} size={148} /></Pop>}
          <Text accessibilityRole="header" style={styles.sheetName}>{item.name.toUpperCase()}</Text>
          <Text style={styles.sheetDetail}>{item.detail}.</Text>
          {item.earnedAt ? <Text style={styles.sheetEarned}>EARNED {formatDate(item.earnedAt.slice(0, 10)).toUpperCase()}. IT’S YOURS NOW.</Text> : null}
          {!item.earnedAt && item.goal > 1 ? (
            <View style={styles.sheetProgress}>
              <Segments total={item.goal} done={item.progress} />
              <Muted style={styles.middle}>{item.progress} of {item.goal}</Muted>
            </View>
          ) : null}
          {!item.earnedAt && item.goal === 1 ? <Muted style={styles.middle}>Not yet. Nobody’s stopping you.</Muted> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  next: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  nextText: { flex: 1, gap: 2 },
  nextLabel: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, color: colors.volt },
  nextName: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.ink },
  allDone: { fontFamily: fonts.display, fontSize: 24, color: colors.volt },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg },
  cell: { width: '33.33%', minHeight: 44, alignItems: 'center', gap: space.xs, paddingHorizontal: 2 },
  cellName: { fontFamily: fonts.label, fontSize: 13, lineHeight: 16, textAlign: 'center', color: colors.ink3 },
  cellNameLit: { color: colors.ink },
  sheet: { alignItems: 'center', gap: space.sm, paddingBottom: space.md },
  sheetName: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.ink, textAlign: 'center', marginTop: space.sm },
  sheetDetail: { fontFamily: fonts.body, fontSize: 17, color: colors.ink2, textAlign: 'center' },
  sheetEarned: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.volt, textAlign: 'center', marginTop: space.xs },
  sheetProgress: { alignSelf: 'stretch', gap: space.xs, marginTop: space.sm },
  middle: { textAlign: 'center' },
});
