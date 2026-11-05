import {
  CALL_DAYS, CALL_POINTS, CALLABLE_DAYS, estimatedMax, exposesSandbag, HONEST_RPE, judgeCall, MAX_OPEN_CALLS, MAX_WEEKLY_CALL_POINTS,
  SANDBAG_BADGE_DAYS, WATCH_DAYS,
} from '@sandbag/shared';
import { router } from 'expo-router';
import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, Linking, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { AvatarArt } from '@/components/Avatar';
import { Icon } from '@/components/icons';
import { LoadView } from '@/components/LoadView';
import { Burst, CountUp, FadeIn, feel, GrowUp, NATIVE, Pop, prefersLessMotion, Stamp } from '@/components/motion';
import { Button, Muted, Segmented, Segments } from '@/components/ui';
import { signedPoints } from '@/domain/format';
import { colors, fonts, radius, space } from '@/theme';

const SOURCE_URL = 'https://github.com/KayraNafi/Sandbag';

/** One lift carries the whole story, so the numbers on every page are the same numbers. */
const CALLED = 60;
const REPS = 5;
const CALLED_MAX = estimatedMax(CALLED, REPS);
const LOWEST = 50;
const HIGHEST = 70;
const STEP = 2.5;
const FULL_EFFORT = HONEST_RPE;
const EASY_EFFORT = 7;
const JUST_SHORT = 57.5;
const WAY_PAST = 65;

const STEPS = ['what', 'call', 'settle', 'wear', 'honest', 'free'] as const;

function Sack({ size }: { size: number }) {
  const scope = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={size * 1.15} viewBox="0 0 120 138">
      <Defs>
        <RadialGradient id={`${scope}sack`} cx="40%" cy="42%" r="72%">
          <Stop offset="0" stopColor="#e6ff7a" />
          <Stop offset="0.55" stopColor={colors.volt} />
          <Stop offset="1" stopColor="#7d9a17" />
        </RadialGradient>
      </Defs>
      <Path d="M44 30C42 20 36 14 40 7c7 5 13 3 20 1 7 2 13 4 20-1 4 7-2 13-4 23z" fill="#a9c92b" />
      <Path d="M44 30C26 40 14 66 14 92c0 26 16 38 46 38s46-12 46-38c0-26-12-52-30-62z" fill={`url(#${scope}sack)`} />
      <Path d="M41 26c10 6 28 6 38 0l2 8c-12 7-30 7-42 0z" fill={colors.voltInk} />
      <Path d="M32 56c-5 10-8 20-8 32M90 60c3 8 5 16 5 24" stroke={colors.voltInk} strokeOpacity={0.28} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M26 112c20 10 48 10 68 0" stroke={colors.voltInk} strokeOpacity={0.45} strokeWidth={2.5} strokeDasharray="5 6" strokeLinecap="round" fill="none" />
      <SvgText x="60" y="96" textAnchor="middle" fontFamily={fonts.display} fontSize={38} fill={colors.voltInk}>?? KG</SvgText>
    </Svg>
  );
}

/** Falls, lands, squashes. The whole idea of the app, dropped on the floor. */
function DroppedSack({ size, onLand }: { size: number; onLand: () => void }) {
  const fall = useRef(new Animated.Value(prefersLessMotion() ? 1 : 0)).current;
  const squash = useRef(new Animated.Value(0)).current;
  const land = useRef(onLand);
  land.current = onLand;
  useEffect(() => {
    if (prefersLessMotion()) return;
    Animated.sequence([
      Animated.delay(160),
      Animated.timing(fall, { toValue: 1, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
    ]).start(({ finished }) => {
      if (!finished) return;
      land.current();
      squash.setValue(1);
      Animated.timing(squash, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
    });
  }, [fall, squash]);
  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-420, 0] });
  const scaleY = squash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] });
  const scaleX = squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  return (
    <View style={styles.sackFloor}>
      <Animated.View style={{ transformOrigin: 'bottom', transform: [{ translateY }, { scaleY }, { scaleX }] }}>
        <Sack size={size} />
      </Animated.View>
    </View>
  );
}

function What() {
  const [landed, setLanded] = useState(0);
  return (
    <View style={styles.page}>
      <View>
        <DroppedSack size={150} onLand={() => { feel.warn(); setLanded(1); }} />
        <Burst fire={landed} spread={0.7} />
      </View>
      <FadeIn delay={480}><Text style={styles.word}>SANDBAGGING</Text></FadeIn>
      <FadeIn delay={600} style={styles.words}>
        <Text style={styles.line}>Holding back on purpose so you look weaker than you are, then acting surprised when you win.</Text>
        <Muted>It’s a racing term, and every gym has someone doing it.</Muted>
      </FadeIn>
    </View>
  );
}

function Stake({ points, label, win, delay }: { points: string; label: string; win?: boolean; delay: number }) {
  return (
    <Pop delay={delay} style={[styles.stake, win ? styles.stakeWin : styles.stakeLose]}>
      <Text style={[styles.stakePoints, !win && styles.stakePointsLose]}>{points}</Text>
      <Text style={styles.stakeLabel}>{label}</Text>
    </Pop>
  );
}

/** The real gesture, on the lift the rest of the story is about. */
function Call() {
  const [called, setCalled] = useState(false);
  return (
    <View style={styles.page}>
      <Text style={styles.heading}>CALL IT</Text>
      <Text style={styles.line}>See a lift from the last {CALLABLE_DAYS} days that looks suspiciously easy? You can have {MAX_OPEN_CALLS} calls open at once.</Text>
      <View style={styles.post}>
        <View style={styles.postHead}>
          <AvatarArt id="frog" size={52} />
          <View style={styles.flex}>
            <Text style={styles.postLift}>Bench press</Text>
            <Text style={styles.postSets}>{CALLED} KG × {REPS}</Text>
          </View>
        </View>
        {called ? <Stamp style={styles.postStamp}><Text style={styles.postStampText}>CALLED</Text></Stamp> : null}
      </View>
      {called ? (
        <View style={styles.stakes}>
          <Stake points={signedPoints(CALL_POINTS.failed.caller)} label="BE RIGHT" win delay={260} />
          <Stake points={signedPoints(CALL_POINTS.cleared.caller)} label="BE WRONG" delay={360} />
        </View>
      ) : (
        <Button title="Call sandbag" variant="danger" onPress={() => { feel.warn(); setCalled(true); }} />
      )}
      <Muted>{called ? `Calls can move your week by ${MAX_WEEKLY_CALL_POINTS} points at most, either way.` : 'Go on. It’s only a frog.'}</Muted>
    </View>
  );
}

function WeightSlider({ value, onChange }: { value: number; onChange: (weight: number) => void }) {
  const width = useRef(1);
  const start = useRef(0);
  const last = useRef(value);
  const report = useRef(onChange);
  report.current = onChange;
  const pick = (x: number) => {
    const ratio = Math.max(0, Math.min(1, x / width.current));
    const weight = LOWEST + Math.round((ratio * (HIGHEST - LOWEST)) / STEP) * STEP;
    if (last.current !== weight) {
      last.current = weight;
      feel.tick();
      report.current(weight);
    }
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      start.current = event.nativeEvent.locationX;
      pick(start.current);
    },
    onPanResponderMove: (_, gesture) => pick(start.current + gesture.dx),
  })).current;
  const at = (weight: number) => `${((weight - LOWEST) / (HIGHEST - LOWEST)) * 100}%` as const;
  const nudge = (by: number) => {
    const next = Math.max(LOWEST, Math.min(HIGHEST, value + by));
    last.current = next;
    onChange(next);
  };
  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Next session’s weight"
      accessibilityValue={{ text: `${value} kilos` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => nudge(nativeEvent.actionName === 'increment' ? STEP : -STEP)}
      onLayout={(event: LayoutChangeEvent) => {
        width.current = event.nativeEvent.layout.width || 1;
      }}
      style={styles.slider}
    >
      <View pointerEvents="none" style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: at(value) }]} />
      </View>
      <View pointerEvents="none" style={[styles.sliderMark, { left: at(CALLED) }]} />
      <View pointerEvents="none" style={[styles.sliderKnob, { left: at(value) }]} />
    </View>
  );
}

const VERDICTS = {
  cleared: {
    stamp: 'NOT GUILTY', points: signedPoints(CALL_POINTS.cleared.target), color: colors.volt,
    line: `They beat it, so they win ${CALL_POINTS.cleared.target} points and whoever called it loses ${-CALL_POINTS.cleared.caller}.`,
  },
  failed: {
    stamp: 'SANDBAG', points: signedPoints(CALL_POINTS.failed.target), color: colors.danger,
    line: `They didn’t beat it. It costs them ${-CALL_POINTS.failed.target} points, and whoever called it wins ${CALL_POINTS.failed.caller}.`,
  },
  watching: { stamp: 'HONEST MISS', points: '0', line: 'Just short at full effort. No points either way, but now they’re being watched.', color: colors.ink },
} as const;

/** Runs the real rule, so playing with this teaches exactly what the app will do. */
function Settle() {
  const [weight, setWeight] = useState(CALLED);
  const [effort, setEffort] = useState<'easy' | 'max'>('easy');
  const verdict = judgeCall(CALLED_MAX, { max: estimatedMax(weight, REPS), rpe: effort === 'max' ? FULL_EFFORT : EASY_EFFORT });
  const look = VERDICTS[verdict];
  return (
    <View style={styles.page}>
      <Text style={styles.heading}>SETTLE IT</Text>
      <Text style={styles.line}>They have {CALL_DAYS} days. Their next logged session of that lift has to beat the number, in weight or in reps. Try it.</Text>
      <LoadView weight={weight} kit="barbell" />
      <View style={styles.sliderRow}>
        <Text style={styles.sliderValue}>{weight} KG × {REPS}</Text>
        <Text style={styles.sliderHint}>THE NUMBER: {CALLED} × {REPS}</Text>
      </View>
      <WeightSlider value={weight} onChange={setWeight} />
      <Segmented options={[{ key: 'easy', label: 'Felt fine' }, { key: 'max', label: 'All out' }]} value={effort} onChange={setEffort} />
      <View style={styles.verdict}>
        <Stamp key={verdict} style={[styles.verdictStamp, { borderColor: look.color }]}>
          <Text style={[styles.verdictText, { color: look.color }]}>{look.stamp}</Text>
        </Stamp>
        <Text style={[styles.verdictPoints, { color: look.color }]}>{look.points}</Text>
      </View>
      <Muted>{look.line}</Muted>
    </View>
  );
}

function Wear() {
  return (
    <View style={styles.page}>
      <Text style={styles.heading}>WEAR IT</Text>
      <View style={styles.wearer}>
        <Pop><AvatarArt id="frog" size={84} /></Pop>
        <View style={styles.flex}>
          <Text style={styles.wearerName}>You</Text>
          <Stamp delay={420} style={styles.wearerStamp}><Text style={styles.wearerBadge}>SANDBAG</Text></Stamp>
        </View>
        <Text style={styles.wearerPoints}>{signedPoints(CALL_POINTS.failed.target)}</Text>
      </View>
      <View style={styles.days}>
        {Array.from({ length: SANDBAG_BADGE_DAYS }, (_, day) => (
          <Pop key={day} delay={560 + day * 70} style={styles.day}><Text style={styles.dayText}>{day + 1}</Text></Pop>
        ))}
      </View>
      <Text style={styles.line}>Don’t beat it, and it costs {-CALL_POINTS.failed.target} points, and the sandbag badge sits next to your name in the rankings for {SANDBAG_BADGE_DAYS} days.</Text>
      <Muted>Skipping it doesn’t help: after {CALL_DAYS} days, no answer counts as failing. A typo gets one fix within a day.</Muted>
    </View>
  );
}

const COLUMN = 170;
const COLUMN_FLOOR = 45;
const barHeight = (weight: number) => ((weight - COLUMN_FLOOR) / (WAY_PAST - COLUMN_FLOOR)) * COLUMN;

function Column({ weight, color, delay }: { weight: number; color: string; delay: number }) {
  return (
    <View style={styles.column}>
      <FadeIn delay={delay + 200}><Text style={[styles.columnValue, { color }]}>{weight}</Text></FadeIn>
      <GrowUp height={barHeight(weight)} delay={delay} style={[styles.columnBar, { backgroundColor: color }]} />
    </View>
  );
}

/** A close miss earns the benefit of the doubt, and then a good session spends it. */
function Honest() {
  const firstMiss = judgeCall(CALLED_MAX, { max: estimatedMax(JUST_SHORT, REPS), rpe: FULL_EFFORT }) === 'watching';
  const caught = exposesSandbag(CALLED_MAX, { max: estimatedMax(WAY_PAST, REPS), rpe: null });
  return (
    <View style={styles.page}>
      <Text style={styles.heading}>HONEST MISS</Text>
      <View style={styles.chart}>
        {/* The line both sessions get judged against. */}
        <View pointerEvents="none" style={[styles.numberLine, { bottom: barHeight(CALLED) }]} />
        <View style={styles.columns}>
          <Column weight={CALLED} color={colors.ink3} delay={120} />
          <Column weight={JUST_SHORT} color={colors.ink} delay={420} />
          <Column weight={WAY_PAST} color={colors.danger} delay={1100} />
        </View>
        <View style={styles.columnNames}>
          <View style={styles.columnName}><Text style={styles.columnLabel}>THE NUMBER</Text></View>
          <View style={styles.columnName}>
            <Text style={styles.columnLabel}>ALL OUT</Text>
            {firstMiss ? <Stamp delay={860}><Text style={styles.columnStamp}>NO BADGE</Text></Stamp> : null}
          </View>
          <View style={styles.columnName}>
            <Text style={styles.columnLabel}>DAYS LATER</Text>
            {caught ? <Stamp delay={1600}><Text style={styles.columnCaught}>{signedPoints(CALL_POINTS.caught.target)}</Text></Stamp> : null}
          </View>
        </View>
      </View>
      <Text style={styles.line}>Just short at full effort isn’t sandbagging, so there’s no badge.</Text>
      <Muted>But lift well past it in the next {WATCH_DAYS} days, and that’s the badge and double the points gone.</Muted>
    </View>
  );
}

function Free() {
  return (
    <View style={styles.page}>
      <Stamp delay={160} style={styles.verdictStamp}><Text style={styles.freeStamp}>IT’S FREE</Text></Stamp>
      <Text style={styles.line}>Sandbag is open source under the AGPL-3.0. Read the code, run your own, or tell us what’s broken.</Text>
      <Button title="See the source" variant="ghost" onPress={() => void Linking.openURL(SOURCE_URL)} />
      <View style={styles.recap}>
        {[{ value: CALL_POINTS.failed.caller, label: 'POINTS TO CALL IT RIGHT' }, { value: CALL_DAYS, label: 'DAYS TO ANSWER' }, { value: SANDBAG_BADGE_DAYS, label: 'DAYS IN THE BADGE' }].map((item, index) => (
          <View key={item.label} style={styles.recapItem}>
            <CountUp value={item.value} delay={300 + index * 160} style={styles.recapValue} />
            <Text style={styles.recapLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const PAGES = { what: What, call: Call, settle: Settle, wear: Wear, honest: Honest, free: Free };

/** The rules, played instead of read: one idea a page, on one lift, ending on the same bench press. */
export default function About() {
  const insets = useSafeAreaInsets();
  const [at, setAt] = useState(0);
  const step = STEPS[at]!;
  const Page = PAGES[step];
  const last = at === STEPS.length - 1;
  return (
    <View style={[styles.host, { paddingBottom: insets.bottom + space.md }]}>
      <Segments total={STEPS.length} done={at + 1} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stage} key={step}>
        <FadeIn><Page /></FadeIn>
      </ScrollView>
      <View style={styles.footer}>
        {at > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { feel.tap(); setAt(at - 1); }} style={styles.back}>
            <Icon name="back" size={24} color={colors.ink2} />
          </Pressable>
        ) : null}
        <Button
          title={last ? 'Got it' : 'Next'}
          style={styles.flex}
          onPress={() => {
            feel.tap();
            if (last) router.back();
            else setAt(at + 1);
          }}
        />
      </View>
    </View>
  );
}

const KNOB = 28;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  host: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.bg },
  stage: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.lg },
  footer: { flexDirection: 'row', gap: space.sm },
  back: { width: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  page: { gap: space.md },
  words: { gap: space.sm },
  sackFloor: { alignItems: 'center', justifyContent: 'flex-end', height: 190 },
  word: { fontFamily: fonts.display, fontSize: 56, lineHeight: 62, color: colors.volt },
  heading: { fontFamily: fonts.display, fontSize: 56, lineHeight: 56, color: colors.volt },
  line: { fontFamily: fonts.bodyStrong, fontSize: 17, lineHeight: 25, color: colors.ink },

  post: { padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 92 },
  postLift: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink2 },
  postSets: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.ink },
  postStamp: { position: 'absolute', right: space.md, top: space.md, paddingHorizontal: space.sm, borderWidth: 3, borderColor: colors.danger, borderRadius: 6, backgroundColor: colors.surface },
  postStampText: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.danger },
  stakes: { flexDirection: 'row', gap: space.sm },
  stake: { flex: 1, gap: 2, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  stakeWin: { backgroundColor: colors.doneBg, borderColor: colors.doneLine },
  stakeLose: { backgroundColor: colors.surface2, borderColor: colors.line },
  stakePoints: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.volt },
  stakePointsLose: { color: colors.danger },
  stakeLabel: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink2 },

  sliderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  sliderValue: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.ink, fontVariant: ['tabular-nums'] },
  sliderHint: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.ink3 },
  slider: { height: 44, justifyContent: 'center' },
  sliderTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  sliderFill: { height: 8, backgroundColor: colors.volt },
  sliderMark: { position: 'absolute', width: 3, height: 22, marginLeft: -1.5, top: 11, borderRadius: 2, backgroundColor: colors.ink },
  sliderKnob: { position: 'absolute', width: KNOB, height: KNOB, marginLeft: -KNOB / 2, top: 8, borderRadius: KNOB / 2, backgroundColor: colors.volt, borderWidth: 4, borderColor: colors.bg },
  verdict: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 56, marginTop: space.sm },
  verdictStamp: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 2, borderWidth: 3, borderColor: colors.volt, borderRadius: 6 },
  verdictText: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38 },
  verdictPoints: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48 },

  wearer: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  wearerName: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  wearerStamp: { alignSelf: 'flex-start', marginTop: space.xs, paddingHorizontal: space.sm, borderWidth: 2, borderColor: colors.warn, borderRadius: 5 },
  wearerBadge: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, letterSpacing: 1, color: colors.warn },
  wearerPoints: { fontFamily: fonts.display, fontSize: 48, lineHeight: 52, color: colors.danger },
  days: { flexDirection: 'row', gap: space.xs },
  day: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.warn },
  dayText: { fontFamily: fonts.display, fontSize: 20, color: colors.bg },

  chart: { gap: space.sm },
  columns: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, height: COLUMN + 36 },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: space.xs },
  columnValue: { paddingHorizontal: space.xs, backgroundColor: colors.bg, fontFamily: fonts.display, fontSize: 28, lineHeight: 32 },
  columnBar: { width: '100%', borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  numberLine: { position: 'absolute', left: 0, right: 0, marginBottom: 72, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.ink2 },
  columnNames: { flexDirection: 'row', gap: space.md, height: 64 },
  columnName: { flex: 1, alignItems: 'center', gap: space.xs },
  columnLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.ink3, textAlign: 'center' },
  columnStamp: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.ink },
  columnCaught: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, color: colors.danger },

  freeStamp: { fontFamily: fonts.display, fontSize: 56, lineHeight: 58, color: colors.volt },
  recap: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  recapItem: { flex: 1, gap: 2 },
  recapValue: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, color: colors.ink },
  recapLabel: { fontFamily: fonts.label, fontSize: 11, lineHeight: 15, letterSpacing: 1, color: colors.ink3 },
});
