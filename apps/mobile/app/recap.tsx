import { addDays, goalIn, seedOf, trainedDates, voice, weekStreak } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/auth/session';
import { BodyMap, MuscleLegend } from '@/components/BodyMap';
import { PlaceMedal } from '@/components/Medal';
import { CountUp, FadeIn, feel, Pop, prefersLessMotion, Stamp } from '@/components/motion';
import { StoryBars } from '@/components/StoryBars';
import { Button, Muted } from '@/components/ui';
import { WeekDots } from '@/components/WeekDots';
import { useData } from '@/data/store';
import { changeWords, fitSize, num, plural } from '@/domain/format';
import { activeLogged, goalsFor, sessionLoad, weekRecap } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

const SCENE_MS = 5500;
const SHOWN_BESTS = 3;
const BACK_ZONE = 1 / 3;
const HOLD_TO_PAUSE_MS = 350;

type Scene = 'moved' | 'body' | 'bests' | 'goal';

const dateWords = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase();

/** Last week as a story: what you moved, what you hit, what you beat, and whether it counted. */
export default function Recap() {
  const { monday = '' } = useLocalSearchParams<{ monday: string }>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const logged = useData((state) => state.logged);
  const setRecapSeen = useData((state) => state.setRecapSeen);
  const me = useSession((state) => state.me);
  const all = useMemo(() => activeLogged(logged), [logged]);
  const recap = useMemo(() => weekRecap(all, monday), [all, monday]);
  const load = useMemo(() => sessionLoad({ entries: recap.sessions.flatMap((item) => item.entries) }), [recap]);
  const trained = useMemo(() => trainedDates(all), [all]);
  const goal = goalIn(goalsFor(me), monday);
  const streak = weekStreak(trained.filter((date) => date <= addDays(monday, 6)), goalsFor(me), addDays(monday, 6), me?.pausedWeeks).current;
  const scenes: Scene[] = ['moved', ...(Object.keys(load).length ? ['body' as const] : []), 'bests', 'goal'];
  const [scene, setScene] = useState<Scene>('moved');
  const at = Math.max(0, scenes.indexOf(scene));
  const manual = useRef(prefersLessMotion()).current;
  const progress = useRef(new Animated.Value(0)).current;
  const nowAt = useRef(0);
  const next = useRef<() => void>(() => {});
  next.current = () => setScene(scenes[at + 1] ?? 'goal');
  const last = scene === 'goal';

  const run = (from: number) => {
    if (manual || last) return;
    Animated.timing(progress, { toValue: 1, duration: SCENE_MS * (1 - from), easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) next.current();
    });
  };
  useEffect(() => {
    if (monday) setRecapSeen(monday);
  }, [monday, setRecapSeen]);
  useEffect(() => {
    progress.setValue(last ? 1 : 0);
    run(0);
    return () => progress.stopAnimation();
    // Each scene starts its own clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const done = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  // Down pauses and up carries on. A quick press also moves, which starts the next scene's clock.
  const pressIn = () => progress.stopAnimation((value) => { nowAt.current = value; });
  const pressOut = () => run(nowAt.current);
  const press = (event: GestureResponderEvent) => {
    feel.tap();
    const to = event.nativeEvent.pageX < screenWidth * BACK_ZONE ? at - 1 : at + 1;
    const pick = scenes[Math.max(0, to)];
    if (pick && pick !== scene) setScene(pick);
    else if (pick === scene) {
      progress.setValue(0);
      run(0);
    }
  };

  const change = changeWords(recap.moved, recap.movedBefore);
  const left = goal - recap.days;
  const volt = scene === 'moved';
  const ink = volt ? colors.voltInk : colors.ink;
  const soft = volt ? colors.voltInk : colors.ink3;
  const words = recap.moved.toLocaleString('en-US');
  const seed = seedOf(monday);

  const show = () => {
    switch (scene) {
      case 'moved':
        return (
          <View key="moved" style={styles.moment}>
            <Text style={[styles.note, { color: ink }]}>{dateWords(monday)} – {dateWords(addDays(monday, 6))}</Text>
            <Stamp delay={80} style={styles.wordStamp}><Text style={[styles.word, { color: ink }]}>LAST WEEK</Text></Stamp>
            {recap.moved ? (
              <>
                <CountUp value={recap.moved} delay={320} commas style={[styles.big, { color: ink, fontSize: fitSize(72, words.length, screenWidth - space.lg * 2), lineHeight: undefined }]} />
                <Text style={[styles.unit, { color: ink }]}>KG MOVED</Text>
                <FadeIn delay={700}><Text style={[styles.line, { color: ink }]}>{voice.lifted(recap.moved)}</Text></FadeIn>
              </>
            ) : null}
            <FadeIn delay={900} style={styles.facts}>
              <Text style={[styles.fact, { color: ink }]}>{plural(recap.sessions.length, 'session')}</Text>
              <Text style={[styles.fact, { color: ink }]}>{plural(recap.sets, 'set')}</Text>
            </FadeIn>
            {change ? <FadeIn delay={1100}><Text style={[styles.note, { color: ink }]}>{change} ON THE WEEK BEFORE</Text></FadeIn> : null}
          </View>
        );
      case 'body':
        return (
          <View key="body" style={styles.moment}>
            <Text style={styles.heading}>WHAT YOU HIT</Text>
            <BodyMap levels={load} size={170} margins={56} />
            <MuscleLegend levels={load} />
          </View>
        );
      case 'bests':
        return (
          <View key="bests" style={styles.moment}>
            {recap.bests.length ? (
              <>
                <Stamp delay={160} style={styles.stamp}><Text style={styles.stampText}>{plural(recap.bests.length, 'NEW BEST').toUpperCase()}</Text></Stamp>
                {recap.bests.slice(0, SHOWN_BESTS).map(({ entry }, place) => (
                  <View key={entry.id} style={styles.best}>
                    <Pop delay={420 + place * 220}><PlaceMedal place={1} size={64} /></Pop>
                    <FadeIn delay={540 + place * 220} style={styles.flex}>
                      <Text numberOfLines={1} style={styles.bestLift}>{entry.name}</Text>
                      <Text style={styles.bestValue}>{entry.kind === 'time' ? `${num(entry.minutes ?? 0)} min` : `${num(entry.weight ?? 0)} kg${entry.reps ? ` × ${entry.reps}` : ''}`}</Text>
                    </FadeIn>
                  </View>
                ))}
                {recap.bests.length > SHOWN_BESTS ? <Muted>And {recap.bests.length - SHOWN_BESTS} more.</Muted> : null}
              </>
            ) : (
              <>
                <Text style={styles.heading}>NO NEW BESTS</Text>
                <Text style={styles.lineDark}>{voice.noBest(seed)}</Text>
              </>
            )}
          </View>
        );
      default:
        return (
          <FadeIn key="goal" style={styles.moment}>
            <View style={styles.bigRow}>
              <CountUp value={recap.days} delay={160} style={[styles.big, { color: left <= 0 ? colors.volt : colors.ink }]} />
              <Text style={styles.bigOf}>{recap.days === 1 ? 'DAY' : 'DAYS'} TRAINED. THE GOAL WAS {goal}.</Text>
            </View>
            <WeekDots trained={trained} today={addDays(monday, 6)} />
            <Text style={[styles.lineDark, left <= 0 && styles.lineVolt]}>{left <= 0 ? voice.recapHit(goal, seed) : voice.recapMissed(left, seed)}</Text>
            {streak > 1 ? <Text style={[styles.unit, { color: soft }]}>{streak} WEEKS RUNNING</Text> : null}
          </FadeIn>
        );
    }
  };

  return (
    <View style={[styles.host, { backgroundColor: volt ? colors.volt : colors.bg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.width}>
        <View style={styles.top}>
          <View style={styles.flex}><StoryBars total={scenes.length} at={at} progress={progress} ink={ink} track={volt ? 'rgba(13, 16, 2, 0.22)' : colors.surface2} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={done} style={styles.skip}>
            <Text style={[styles.skipText, { color: soft }]}>CLOSE</Text>
          </Pressable>
        </View>
        <View style={styles.stage}>
          {show()}
          {last ? null : <Pressable accessibilityRole="button" accessibilityLabel="Next" delayLongPress={HOLD_TO_PAUSE_MS} onLongPress={() => {}} onPressIn={pressIn} onPressOut={pressOut} onPress={press} style={StyleSheet.absoluteFill} />}
        </View>
        {last ? <View style={styles.footer}><Button title="This week, then" onPress={done} /></View> : null}
        {manual && !last ? <View style={styles.footer}><Button title="Next" onPress={() => setScene(scenes[at + 1] ?? 'goal')} /></View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  host: { flex: 1, paddingHorizontal: space.lg },
  width: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  skip: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1 },
  stage: { flex: 1, justifyContent: 'center', paddingVertical: space.md },
  moment: { gap: space.md },
  footer: { gap: space.sm, paddingTop: space.sm },
  wordStamp: { alignSelf: 'flex-start', marginVertical: space.sm },
  word: { fontFamily: fonts.display, fontSize: 56, lineHeight: 64 },
  bigRow: { gap: 2 },
  big: { fontFamily: fonts.display, fontSize: 72, lineHeight: 90, fontVariant: ['tabular-nums'] },
  bigOf: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 2, color: colors.ink3 },
  unit: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 2 },
  note: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1 },
  line: { fontFamily: fonts.bodyStrong, fontSize: 20, lineHeight: 26 },
  lineDark: { fontFamily: fonts.bodyStrong, fontSize: 20, lineHeight: 26, color: colors.ink },
  lineVolt: { color: colors.volt },
  facts: { flexDirection: 'row', gap: space.md },
  fact: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  heading: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.volt },
  stamp: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: space.xs, borderWidth: 3, borderColor: colors.volt, borderRadius: 6 },
  stampText: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.volt },
  best: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bestLift: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  bestValue: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.ink },
});
