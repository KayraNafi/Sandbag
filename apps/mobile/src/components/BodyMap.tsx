import { MUSCLES, type Muscle } from '@sandbag/shared';
import { useEffect, useId, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors, fonts, space } from '@/theme';
import { EASE_OUT, NATIVE, Pop, prefersLessMotion } from './motion';

export const MUSCLE_NAMES: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  abs: 'Abs', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves',
};

const WIDTH = 240;
const HEIGHT = 452;
const TOP = -10;
const SEAM = '#0f100c';
const SKIN = '#3f4137';
/** Under this, lines and shine are just noise. */
const DETAIL_FROM = 60;

// Light in the middle, dark at the edge, which is what makes a muscle look round.
const SHADES = [
  ['#4c4f43', '#2a2c25'],
  ['#7d9232', '#46531c'],
  ['#a3c13a', '#5f7126'],
  ['#c5e83f', '#7c932b'],
  ['#e6ff6a', '#94b02c'],
] as const;

/** A muscle at any level has to look lit, so anything above nothing starts on the first step. */
const shade = (amount: number) => (amount <= 0 ? 0 : amount < 0.3 ? 1 : amount < 0.6 ? 2 : amount < 0.9 ? 3 : 4);

type Shape = readonly [Muscle, string];

type Mark = { d: string; fill?: string; stroke?: string; width?: number; o?: number };

// Half a body, built like someone who has never skipped anything. The other half is the same drawing, mirrored.
const SILHOUETTE = 'M120 44L102 44L100 58C96 66 78 72 62 74C42 74 20 86 13 112C10 126 10 138 13 148C8 160 6 174 8 186C2 204 1 228 6 250L26 251C34 232 42 208 44 184C48 168 52 156 58 146C60 160 68 180 76 206C76 222 72 236 68 248C58 266 50 292 56 322C58 332 66 338 68 346C60 358 56 378 66 400C72 410 76 414 78 418L96 418C100 408 108 384 106 350C108 336 112 312 114 292C116 276 118 264 120 258Z';

const FOREARMS: Shape[] = [
  ['forearms', 'M10 188C4 206 3 228 8 250L15 250C20 232 24 212 25 194C20 194 14 192 10 188Z'],
  ['forearms', 'M28 194C27 214 22 234 17 250L24 250C32 232 40 208 42 184C38 192 33 195 28 194Z'],
];

const FRONT: Shape[] = [
  ['back', 'M100 60C92 67 78 72 64 75C80 74 104 76 119 80L119 72C110 70 104 66 100 60Z'],
  ['shoulders', 'M62 76C44 76 22 88 15 112C12 126 12 136 15 148C24 150 34 140 44 126C52 114 60 104 66 92C68 86 66 80 62 76Z'],
  ['chest', 'M119 82C104 76 80 76 66 80C67 86 68 88 66 92C60 104 52 114 46 124C48 134 52 142 58 146C74 156 104 156 119 146Z'],
  ['biceps', 'M18 150C12 162 9 174 10 184C16 192 34 192 40 182C46 168 50 154 56 144C50 140 44 136 42 130C36 140 26 150 18 150Z'],
  ...FOREARMS,
  ['back', 'M58 148C60 160 66 176 74 192C76 180 78 168 82 156C74 154 66 152 58 148Z'],
  ['abs', 'M84 156C78 170 76 186 78 206C78 220 76 232 72 244C82 248 92 254 102 262C100 236 99 206 99 182C99 172 98 162 96 156C92 158 88 158 84 156Z'],
  ['abs', 'M119 150C112 156 106 158 101 158C100 164 100 170 101 175L119 175Z'],
  ['abs', 'M119 178L101 178C100 184 100 190 101 196L119 196Z'],
  ['abs', 'M119 199L102 199C101 205 101 211 102 217L119 217Z'],
  ['abs', 'M119 220L103 220C103 234 109 252 119 262Z'],
  ['quads', 'M68 250C58 268 52 294 57 320C59 330 64 338 72 342C78 340 83 338 86 334C83 318 82 296 82 274C81 262 76 254 68 250Z'],
  ['quads', 'M72 248C78 254 83 262 83 274C83 296 84 318 87 334C94 320 104 298 107 276C107 268 105 262 101 258C93 252 82 249 72 248Z'],
  ['quads', 'M108 284C113 304 112 324 105 340C100 346 92 344 88 337C96 324 105 304 108 284Z'],
  ['quads', 'M104 258C110 262 113 272 113 288L110 288C110 276 108 266 104 258Z'],
  ['calves', 'M68 350C60 362 58 380 66 398C70 402 76 400 78 394C81 380 83 364 82 352C78 354 72 354 68 350Z'],
  ['calves', 'M86 352C88 368 88 384 86 400C90 402 94 400 96 396C102 382 106 366 104 350C100 354 92 356 86 352Z'],
];

const BACK: Shape[] = [
  ['back', 'M100 58C94 66 78 72 62 75C76 84 90 94 96 112C102 126 110 140 119 152L119 62C112 62 106 60 100 58Z'],
  ['shoulders', 'M60 76C44 76 22 88 15 112C12 126 12 136 15 148C28 146 44 132 52 116C56 104 62 88 60 76Z'],
  ['back', 'M62 80C58 92 56 104 54 118C66 126 82 124 93 112C88 100 76 88 62 80Z'],
  ['back', 'M54 122C56 140 62 164 72 194C78 208 90 222 102 232C103 200 108 170 116 152C108 138 100 126 95 116C84 128 68 130 54 122Z'],
  ['back', 'M119 156C112 172 106 202 105 232C110 240 115 246 119 250Z'],
  ['triceps', 'M18 150C12 162 9 174 10 186C18 188 26 184 30 178C34 166 38 150 40 134C32 142 26 148 18 150Z'],
  ['triceps', 'M43 130C42 150 38 166 33 182C38 188 42 184 44 178C48 166 52 154 56 144C50 140 46 136 43 130Z'],
  ...FOREARMS,
  ['glutes', 'M76 214C74 226 70 238 68 250C76 246 86 238 96 226C90 222 82 218 76 214Z'],
  ['glutes', 'M100 228C88 240 76 252 70 258C72 274 86 290 104 290C112 290 118 286 119 280L119 252C112 242 106 234 100 228Z'],
  ['hamstrings', 'M68 264C58 284 54 304 57 324C59 334 65 340 72 345C80 332 86 314 88 294C80 292 72 280 68 264Z'],
  ['hamstrings', 'M90 295C90 316 84 334 74 346C86 352 98 348 104 340C110 324 113 306 113 292C106 296 98 297 90 295Z'],
  ['calves', 'M68 350C58 364 56 382 64 398C68 404 76 402 80 396C84 382 85 366 84 352C78 354 72 354 68 350Z'],
  ['calves', 'M87 352C90 368 90 384 87 396C92 402 98 400 100 394C106 380 108 364 104 350C100 354 92 356 87 352Z'],
];

// Dark lines on top of the muscle: fibres and folds.
const LINES_FRONT: string[] = [
  'M74 88C88 98 104 106 118 110', 'M68 104C84 116 102 124 118 128',
  'M36 92C38 108 36 126 30 142', 'M50 82C50 98 46 114 38 130',
  'M20 170C28 164 38 156 46 148', 'M14 206C13 220 12 232 13 244', 'M34 204C31 218 27 232 22 244',
  'M66 284C64 298 64 312 67 328', 'M95 268C96 286 96 304 94 324', 'M72 366C70 376 70 384 72 392',
  'M84 168C84 188 86 212 92 236', 'M66 136C72 142 76 146 82 150', 'M64 152C68 156 72 160 78 162',
];
const LINES_BACK: string[] = [
  'M72 86C84 96 94 108 100 122', 'M112 100C112 124 114 148 118 166', 'M68 142C80 150 92 154 104 154', 'M72 168C84 176 96 180 108 180',
  'M36 92C36 108 34 124 28 140', 'M50 82C48 98 46 110 40 124',
  'M20 170C24 166 28 160 30 152', 'M14 206C13 220 12 232 13 244', 'M34 204C31 218 27 232 22 244',
  'M84 256C92 268 104 276 116 276', 'M72 300C72 316 72 330 74 342', 'M102 300C102 316 98 332 92 344', 'M72 366C70 376 70 384 72 392',
];
// Light catching the top of each big muscle.
const SHINE_FRONT: string[] = [
  'M78 88C88 84 102 86 112 92', 'M34 94C40 86 48 82 56 82', 'M18 164C22 158 30 150 40 146', 'M64 266C62 276 60 288 60 298', 'M86 262C90 262 96 264 100 268', 'M66 362C63 370 62 378 63 386',
];
const SHINE_BACK: string[] = [
  'M34 94C40 86 48 82 56 82', 'M60 132C60 142 62 152 66 164', 'M82 244C90 240 98 240 106 244', 'M66 276C62 288 60 300 60 312', 'M66 362C63 370 62 378 63 386',
];

// The neck sits behind the traps. The head stays blank, so nobody has to look like anybody.
const NECK: Mark[] = [
  { d: 'M100 50C101 62 97 70 84 80L156 80C143 70 139 62 140 50Z', fill: SKIN },
];
const HEAD: Mark[] = [
  { d: 'M120 -6C104 -6 96 6 96 22C96 36 100 50 108 58C112 62 116 64 120 64C124 64 128 62 132 58C140 50 144 36 144 22C144 6 136 -6 120 -6Z', fill: SKIN },
];
const LIMB = '#4a4c41';

/** Each finger twice: a dark one underneath, so it stands apart from the one beside it. */
const finger = (d: string, width: number): Mark[] => [
  { d, stroke: SEAM, width: width + 1.4 },
  { d, stroke: LIMB, width },
];

const HAND: Mark[] = [
  ...finger('M25 255C30 259 32 265 30 274', 5),
  ...finger('M8.5 269C7.5 276 7.5 282 8.5 287', 4.2),
  ...finger('M13 270C12.5 278 12.5 285 13.5 292', 4.4),
  ...finger('M17.6 270C17.6 278 17.6 285 18 291', 4.4),
  ...finger('M22 269C22.6 275 22.6 280 22 285', 4.2),
  { d: 'M7 249L26 250C28 256 27 264 25 271L6 271C4 264 4 256 7 249Z', fill: LIMB },
  { d: 'M9 257C13 255 19 255 24 257', stroke: SEAM, width: 0.8, o: 0.5 },
];

const FOOT_FRONT: Mark[] = [
  { d: 'M78 416C78 424 72 430 68 434C64 438 65 442 70 442L100 442C104 442 104 437 102 433C99 428 97 423 96 416Z', fill: LIMB, stroke: SEAM, width: 1 },
  { d: 'M74 436L73.4 442', stroke: SEAM, width: 0.9 },
  { d: 'M79.6 436L79.4 442', stroke: SEAM, width: 0.9 },
  { d: 'M85.4 436L85.4 442', stroke: SEAM, width: 0.9 },
  { d: 'M91.6 435.4L92 442', stroke: SEAM, width: 0.9 },
  { d: 'M84 420C84 426 86 430 90 432', stroke: SEAM, width: 0.8, o: 0.4 },
];

const FOOT_BACK: Mark[] = [
  { d: 'M78 416C78 424 73 431 71 436C70 440 73 442 77 442L98 442C102 442 102 438 101 434C99 428 97 423 96 416Z', fill: LIMB, stroke: SEAM, width: 1 },
  { d: 'M87 416C87 422 87 428 87 433', stroke: SEAM, width: 0.8, o: 0.45 },
  { d: 'M79 436C84 433 92 433 97 436', stroke: SEAM, width: 0.8, o: 0.4 },
];

const paint = (marks: Mark[]) => marks.map(({ d, fill, stroke, width, o = 1 }, index) => (
  <Path
    key={index}
    d={d}
    fill={fill ?? 'none'}
    fillOpacity={o}
    stroke={stroke ?? 'none'}
    strokeWidth={width ?? 1}
    strokeOpacity={o}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
));

function Layer({ shapes, lines, shine, foot, step, onPick, under, size }: {
  shapes: Shape[];
  lines: string[];
  shine: string[];
  foot: Mark[];
  step: (muscle: Muscle) => number;
  onPick?: ((muscle: Muscle) => void) | undefined;
  under?: boolean;
  size: number;
}) {
  const detail = size > DETAIL_FROM;
  // Its own ids: on the web they're shared across the page, and ones inside a hidden screen paint nothing.
  const scope = useId().replace(/[^a-zA-Z0-9]/g, '');
  const half = (
    <>
      {under ? <Path d={SILHOUETTE} fill={SKIN} /> : null}
      {under ? paint(HAND) : null}
      {under ? paint(foot) : null}
      {shapes.map(([muscle, d]) => {
        const at = step(muscle);
        if (at < 0) return null;
        return <Path key={d} d={d} fill={`url(#${scope}m${at})`} stroke={SEAM} strokeWidth={detail ? 1 : 0.6} strokeLinejoin="round" {...(onPick ? { onPress: () => onPick(muscle) } : {})} />;
      })}
      {detail ? lines.map((d) => <Path key={d} d={d} fill="none" stroke={SEAM} strokeOpacity={0.45} strokeWidth={1} strokeLinecap="round" />) : null}
      {detail ? shine.map((d) => <Path key={d} d={d} fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeWidth={1.6} strokeLinecap="round" />) : null}
    </>
  );
  return (
    <Svg width={size} height={(size * HEIGHT) / WIDTH} viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT}`}>
      <Defs>
        {SHADES.map(([middle, edge], index) => (
          <RadialGradient key={middle} id={`${scope}m${index}`} cx="0.42" cy="0.32" r="0.8">
            <Stop offset="0" stopColor={middle} />
            <Stop offset="1" stopColor={edge} />
          </RadialGradient>
        ))}
      </Defs>
      {under ? paint(NECK) : null}
      {half}
      <G transform={`translate(${WIDTH} 0) scale(-1 1)`}>{half}</G>
      {paint(HEAD.map((mark) => ({ ...mark, fill: `url(#${scope}m0)` })))}
    </Svg>
  );
}

function Figure({ shapes, lines, shine, foot, level, onPick, selected, size, delay }: {
  shapes: Shape[];
  lines: string[];
  shine: string[];
  foot: Mark[];
  level: (muscle: Muscle) => number;
  onPick?: ((muscle: Muscle) => void) | undefined;
  selected?: Muscle | null | undefined;
  size: number;
  delay: number;
}) {
  const light = useRef(new Animated.Value(prefersLessMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (prefersLessMotion()) return;
    Animated.timing(light, { toValue: 1, duration: 520, delay, easing: EASE_OUT, useNativeDriver: NATIVE }).start();
  }, [light, delay]);
  const lit = (muscle: Muscle) => (selected === muscle ? 4 : level(muscle) > 0 ? shade(level(muscle)) : -1);
  if (size <= DETAIL_FROM) return <Layer shapes={shapes} lines={lines} shine={shine} foot={foot} step={(muscle) => Math.max(0, lit(muscle))} onPick={onPick} under size={size} />;
  return (
    <View>
      <Layer shapes={shapes} lines={lines} shine={shine} foot={foot} step={() => 0} onPick={onPick} under size={size} />
      {/* The dark body first, then the work comes up on top of it. Taps go to the layer below. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: light }]}>
        <Layer shapes={shapes} lines={lines} shine={shine} foot={foot} step={lit} size={size} />
      </Animated.View>
    </View>
  );
}

/**
 * The front and back of a body, with muscles lit by how much they've been worked.
 * Levels run from 0 to 1. Drawn for this app, so it can ship under its licence.
 */
export function BodyMap({ levels = {}, onPick, selected, size = 96, margins = 104 }: {
  levels?: Partial<Record<Muscle, number>>;
  onPick?: (muscle: Muscle) => void;
  selected?: Muscle | null;
  size?: number;
  /** What the screen and any card around it take from the width. */
  margins?: number;
}) {
  const { width } = useWindowDimensions();
  // Two figures, a gap, and the card and screen margins around them. Small phones still fit.
  const fitted = Math.min(size, (Math.min(width, 640) - margins) / 2);
  const level = (muscle: Muscle) => levels[muscle] ?? 0;
  const worked = MUSCLES.filter((muscle) => level(muscle) > 0).map((muscle) => MUSCLE_NAMES[muscle]);
  return (
    <View style={styles.host} accessible={!onPick} accessibilityLabel={worked.length ? `Worked: ${worked.join(', ')}` : 'Body diagram'}>
      <View style={styles.side}>
        <Figure shapes={FRONT} lines={LINES_FRONT} shine={SHINE_FRONT} foot={FOOT_FRONT} level={level} onPick={onPick} selected={selected} size={fitted} delay={120} />
        {fitted > 60 ? <Text style={styles.caption}>FRONT</Text> : null}
      </View>
      <View style={styles.side}>
        <Figure shapes={BACK} lines={LINES_BACK} shine={SHINE_BACK} foot={FOOT_BACK} level={level} onPick={onPick} selected={selected} size={fitted} delay={240} />
        {fitted > 60 ? <Text style={styles.caption}>BACK</Text> : null}
      </View>
    </View>
  );
}

const STEPS = [0, 1, 2, 3];

/** What the picture says, in words: hardest worked first, four bars for how much. */
export function MuscleLegend({ levels }: { levels: Partial<Record<Muscle, number>> }) {
  const worked = MUSCLES.filter((muscle) => (levels[muscle] ?? 0) > 0).sort((a, b) => (levels[b] ?? 0) - (levels[a] ?? 0));
  return (
    <View style={styles.legend}>
      {worked.map((muscle, place) => {
        const at = shade(levels[muscle] ?? 0);
        return (
          <View key={muscle} style={styles.legendItem}>
            <Text numberOfLines={1} style={styles.legendName}>{MUSCLE_NAMES[muscle]}</Text>
            <View style={styles.bars}>
              {STEPS.map((step) => (
                <Pop key={step} delay={300 + place * 90 + step * 60} style={styles.flex}>
                  <View style={[styles.bar, step < at && { backgroundColor: SHADES[at]![0] }]} />
                </Pop>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The same muscles as words, so the body isn't the only way in. */
export function MuscleChips({ selected, onPick }: { selected: Muscle | null; onPick: (muscle: Muscle | null) => void }) {
  return (
    <View style={styles.chips}>
      {MUSCLES.map((muscle) => (
        <Pressable
          key={muscle}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === muscle }}
          onPress={() => onPick(selected === muscle ? null : muscle)}
          style={[styles.chip, selected === muscle && styles.chipOn]}
        >
          <Text style={[styles.chipText, selected === muscle && styles.chipTextOn]}>{MUSCLE_NAMES[muscle]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flexDirection: 'row', justifyContent: 'center', gap: space.md },
  side: { alignItems: 'center', gap: space.sm },
  caption: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.ink3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, columnGap: space.lg },
  legendItem: { width: '46%', flexGrow: 1, gap: space.xs },
  legendName: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  bars: { flexDirection: 'row', gap: 3 },
  flex: { flex: 1 },
  bar: { height: 6, backgroundColor: colors.surface2, transform: [{ skewX: '-18deg' }] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 44, paddingHorizontal: space.md, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.volt, borderColor: colors.volt },
  chipText: { fontFamily: fonts.label, fontSize: 15, color: colors.ink2 },
  chipTextOn: { color: colors.voltInk },
});
