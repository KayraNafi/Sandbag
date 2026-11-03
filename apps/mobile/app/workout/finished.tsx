import { exerciseKey, goalIn, periodStats, seedOf, trainedDates, voice, weekStreak, type CallView } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Avatar } from '@/components/Avatar';
import { BodyMap, MuscleLegend } from '@/components/BodyMap';
import { confirm } from '@/components/confirm';
import { PlaceMedal } from '@/components/Medal';
import { CountUp, EASE_OUT, FadeIn, feel, GrowBar, GrowUp, NATIVE, Pop, prefersLessMotion, Stamp } from '@/components/motion';
import { PAPER, PAPER_INK } from '@/components/SessionCard';
import { SessionCards, useCardData } from '@/components/SessionCards';
import { SessionTrend } from '@/components/SessionTrend';
import { StoryBars } from '@/components/StoryBars';
import { toast } from '@/components/Toast';
import { Button, Muted } from '@/components/ui';
import { WeekDots } from '@/components/WeekDots';
import { createSaved, updateSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { changeWords, fitSize, num, ordinal, plural, toIsoDate } from '@/domain/format';
import { activeLogged, goalsFor, leftOutOf, medalsFor, sameExercises, sameWorkoutSessions, sessionLoad, sessionRank, toSavedExercises, trustedEntries, volumeOf, type LiftMedal } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

const PLATE_KG = 20;
const PLATE_ROW = 16;
/** Roughly what everything above the plates takes up. */
const WORDS_HEIGHT = 460;
const PLATE_SHARES = [1, 0.7, 0.88, 0.6, 0.8];
/** Not every plate on a stack is the same size, or it stops looking like a stack. */
const PLATE_WIDTHS = ['100%', '100%', '84%', '100%', '92%', '100%', '76%'] as const;
const SHOWN_MEDALS = 4;
const SHOWN_LEFT_OUT = 2;
/** About three times what the hardest sessions on record get to. */
const BELIEVABLE_SESSION_KG = 200_000;
/** Faster than this and nobody was resting. */
const SPEEDRUN_SETS = 5;
const SPEEDRUN_SECONDS_A_SET = 10;
const HOLD_TO_PAUSE_MS = 350;
/** The left third goes back, like every other story. */
const BACK_ZONE = 1 / 3;

type Scene = 'moved' | 'medals' | 'body' | 'history' | 'week' | 'verdict' | 'plan' | 'card';

const SCENE_MS: Record<Scene, number> = { moved: 5500, medals: 5000, body: 5000, history: 5500, week: 6500, verdict: 7000, plan: 0, card: 0 };

interface Tone { bg: string; ink: string; soft: string; track: string }

const VOLT_TONE: Tone = { bg: colors.volt, ink: colors.voltInk, soft: colors.voltInk, track: 'rgba(13, 16, 2, 0.22)' };
const DARK_TONE: Tone = { bg: colors.bg, ink: colors.ink, soft: colors.ink3, track: colors.surface2 };
const PAPER_TONE: Tone = { bg: PAPER, ink: PAPER_INK, soft: '#6e6f62', track: 'rgba(20, 21, 15, 0.16)' };
const CAUGHT_TONE: Tone = { bg: colors.danger, ink: colors.voltInk, soft: colors.voltInk, track: 'rgba(13, 16, 2, 0.22)' };

/** A new best turns the whole screen volt for a moment, so it feels like something happened. */
function BestFlash() {
  const opacity = useRef(new Animated.Value(prefersLessMotion() ? 0 : 1)).current;
  const [gone, setGone] = useState(prefersLessMotion());
  useEffect(() => {
    if (gone) return;
    Animated.timing(opacity, { toValue: 0, duration: 620, delay: 80, easing: EASE_OUT, useNativeDriver: NATIVE }).start(() => setGone(true));
  }, [gone, opacity]);
  if (gone) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity }]} />;
}

/** What you moved, as the plates you'd have had to carry. They fill whatever the words leave free. */
function PlateStacks({ moved, color }: { moved: number; color: string }) {
  // A fair guess until it's measured, so the stacks can start growing straight away.
  const { height: screen } = useWindowDimensions();
  const [room, setRoom] = useState(Math.max(PLATE_ROW * 3, screen - WORDS_HEIGHT));
  const plates = moved / PLATE_KG;
  const totalShare = PLATE_SHARES.reduce((sum, share) => sum + share, 0);
  const most = Math.floor(room / PLATE_ROW);
  return (
    <View
      pointerEvents="none"
      onLayout={(event: LayoutChangeEvent) => setRoom(event.nativeEvent.layout.height)}
      style={styles.stacks}
    >
      {PLATE_SHARES.map((share, column) => {
        const rows = Math.min(most, Math.ceil((plates * share) / totalShare));
        return (
          <GrowUp key={column} height={rows * PLATE_ROW} delay={260 + column * 90} style={styles.stack}>
            {Array.from({ length: rows }, (_, row) => (
              <View key={row} style={[styles.plate, { width: PLATE_WIDTHS[(row + column) % PLATE_WIDTHS.length], backgroundColor: color }]} />
            ))}
          </GrowUp>
        );
      })}
    </View>
  );
}

function MedalLine({ medal, delay, tone }: { medal: LiftMedal; delay: number; tone: Tone }) {
  const { entry, place, was } = medal;
  const value = entry.kind === 'time' ? `${num(entry.minutes ?? 0)} min` : `${num(entry.weight ?? 0)} kg${entry.reps ? ` × ${entry.reps}` : ''}`;
  const before = was ? (was.kind === 'time' ? `${num(was.minutes ?? 0)} min` : `${num(was.weight ?? 0)} × ${was.reps ?? '–'}`) : null;
  const words = place === 1 ? 'YOUR BEST EVER' : place === 2 ? 'YOUR 2ND BEST EVER' : 'YOUR 3RD BEST EVER';
  return (
    <View style={styles.medal}>
      <Pop delay={delay}><PlaceMedal place={place} size={64} /></Pop>
      <FadeIn delay={delay + 120} style={styles.flex}>
        <Text numberOfLines={1} style={[styles.medalLift, { color: tone.ink }]}>{entry.name}</Text>
        <Text style={[styles.medalValue, { color: tone.ink }]}>{value}</Text>
        <Text style={[styles.medalWords, { color: tone.soft }]}>{words}{before ? ` · WAS ${before}` : ''}</Text>
      </FadeIn>
    </View>
  );
}

const VERDICTS: Partial<Record<CallView['status'], { stamp: string; points: string; line: (exercise: string) => string; win: boolean }>> = {
  cleared: { stamp: 'NOT GUILTY', points: '+5', line: voice.callClearedYou, win: true },
  failed: { stamp: 'SANDBAG', points: '−5', line: voice.callFailedYou, win: false },
  watching: { stamp: 'HONEST MISS', points: '0', line: voice.honestMissYou, win: true },
  confirmed: { stamp: 'CAUGHT', points: '−10', line: voice.confirmedYou, win: false },
};

/** A session gets its moments like a story: full screen, one at a time, moving by themselves. */
export default function Finished() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const logged = useData((state) => state.logged);
  const saved = useData((state) => state.saved);
  const workout = id ? logged[id] : undefined;
  const me = useSession((state) => state.me);
  const [handled, setHandled] = useState(false);
  const [scene, setScene] = useState<Scene>('moved');
  const [manual, setManual] = useState(prefersLessMotion());
  const today = toIsoDate(new Date());
  const target = goalIn(goalsFor(me), today);
  const all = useMemo(() => activeLogged(logged), [logged]);
  const trained = useMemo(() => trainedDates(all), [all]);
  const streak = weekStreak(trained, goalsFor(me), today, me?.pausedWeeks).current;
  const crew = useQuery({ queryKey: ['crew'], queryFn: api.crew });
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const card = useCardData(workout);
  const progress = useRef(new Animated.Value(0)).current;
  const nowAt = useRef(0);

  const medals = useMemo(() => (workout ? medalsFor(all, workout) : []), [all, workout]);
  const sessions = useMemo(() => (workout ? sameWorkoutSessions(all, workout) : []), [all, workout]);
  const load = useMemo(() => (workout ? sessionLoad(workout) : {}), [workout]);
  const verdicts = (calls.data ?? []).filter((call) => workout && call.target.id === me?.id && call.settledBy === workout.id && VERDICTS[call.status]);
  const source = workout?.savedWorkoutId ? saved[workout.savedWorkoutId] : undefined;
  const changed = Boolean(workout && source && !source.deleted && !sameExercises(source.exercises, workout.entries));
  const unsaved = !source || source.deleted;
  const moved = workout ? volumeOf(workout) : 0;
  const first = all.length === 1;
  const leftOut = workout ? leftOutOf(workout) : [];
  const lifts = workout ? trustedEntries(workout.entries).length : 0;
  const allJokes = Boolean(leftOut.length && !lifts);
  const tooMuch = moved > BELIEVABLE_SESSION_KG;
  const scenes: Scene[] = [
    'moved',
    ...(medals.length ? ['medals' as const] : []),
    ...(Object.keys(load).length ? ['body' as const] : []),
    ...(sessions.length > 1 && moved ? ['history' as const] : []),
    'week',
    ...(verdicts.length ? ['verdict' as const] : []),
    ...(!handled && (unsaved || changed) ? ['plan' as const] : []),
    'card',
  ];
  const at = Math.max(0, scenes.indexOf(scene));
  const next = useRef<() => void>(() => {});
  next.current = () => setScene(scenes[at + 1] ?? 'card');

  useEffect(() => {
    // The web version always answers yes, which would switch the story off for everyone.
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (on) setManual(true); }).catch(() => {});
  }, []);

  const duration = SCENE_MS[scene];
  const run = (from: number) => {
    if (manual || !duration) return;
    Animated.timing(progress, { toValue: 1, duration: duration * (1 - from), easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) next.current();
    });
  };
  useEffect(() => {
    progress.setValue(duration ? 0 : 1);
    run(0);
    if (scene === 'moved') {
      if (allJokes || tooMuch) feel.warn();
      else feel.win();
    }
    if (scene === 'medals' && medals[0]?.place === 1) feel.win();
    if (scene === 'verdict') feel.warn();
    return () => progress.stopAnimation();
    // Each scene starts its own clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, manual]);

  // Nothing to show and no way back without this, since the story hides the header.
  if (!workout || !card) return <Redirect href="/" />;
  const sets = card.sets;
  const seed = seedOf(workout.id);
  const didToday = new Set(workout.entries.map((entry) => exerciseKey(entry.name)));
  const lost = source ? source.exercises.filter((exercise) => !didToday.has(exerciseKey(exercise.name))).map((exercise) => exercise.name) : [];
  const before = sessions.at(-2);
  const repeatToday = before?.date === workout.date;
  const movedChange = before && moved ? moved - volumeOf(before) : 0;
  const changeLabel = before ? changeWords(moved, volumeOf(before)) : null;
  const speedrun = sets >= SPEEDRUN_SETS && workout.durationSeconds && workout.durationSeconds / sets < SPEEDRUN_SECONDS_A_SET;
  const rank = sessionRank(sessions, workout);
  const scoreBefore = periodStats(all.filter((item) => item.id !== workout.id), 'week', today).score;
  const scoreNow = periodStats(all, 'week', today).score;
  const gained = Math.max(0, scoreNow - scoreBefore);
  const match = crew.data?.match;
  const opponent = match?.note === 'match' ? match.opponent : null;
  const caught = verdicts.some((call) => !VERDICTS[call.status]?.win);
  const tone: Tone = scene === 'moved' ? VOLT_TONE : scene === 'history' ? PAPER_TONE : scene === 'verdict' ? (caught ? CAUGHT_TONE : VOLT_TONE) : DARK_TONE;

  const go = (to: number) => {
    feel.tap();
    const scenePick = scenes[Math.max(0, to)];
    if (scenePick === scene) {
      // Back from the first scene just starts it again.
      progress.setValue(0);
      run(0);
      return;
    }
    if (scenePick) setScene(scenePick);
    else setScene('card');
  };
  const skip = () => go(scenes.indexOf(!handled && (unsaved || changed) ? 'plan' : 'card'));
  // Down pauses and up carries on. A quick press also moves, which starts the next scene's clock.
  const pressIn = () => progress.stopAnimation((value) => { nowAt.current = value; });
  const pressOut = () => run(nowAt.current);
  const press = (event: GestureResponderEvent) => go(event.nativeEvent.pageX < screenWidth * BACK_ZONE ? at - 1 : at + 1);
  const update = async () => {
    if (!source) return;
    if (lost.length && !(await confirm(`Drop ${plural(lost.length, 'lift')} from ${source.name}?`, `You skipped ${lost.join(', ')} today, so ${lost.length === 1 ? 'it comes' : 'they come'} out of the saved workout.`, 'Update anyway', 'bag'))) return;
    updateSaved(source, { exercises: toSavedExercises(workout.entries) });
    setHandled(true);
    setScene('card');
    toast('Updated.');
  };
  const done = () => {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  };

  const show = () => {
    switch (scene) {
      case 'moved':
        return (
          <View key="moved" style={styles.moment}>
            <Stamp delay={80} style={styles.doneStamp}><Text style={[styles.doneWord, { color: tone.ink }]}>{allJokes || tooMuch ? 'SURE.' : first ? 'NO. 1' : 'DONE.'}</Text></Stamp>
            {moved > 0 ? (
              <>
                <View style={styles.bigRow}>
                  <CountUp value={moved} delay={320} commas style={[styles.big, { color: tone.ink, fontSize: fitSize(72, moved.toLocaleString('en-US').length, screenWidth - space.lg * 2), lineHeight: undefined }]} />
                  <Text style={[styles.unit, { color: tone.ink }]}>KG MOVED</Text>
                </View>
                <FadeIn delay={700}><Text style={[styles.line, { color: tone.ink }]}>{voice.lifted(moved)}</Text></FadeIn>
              </>
            ) : <FadeIn delay={300}><Text style={[styles.line, { color: tone.ink }]}>{allJokes ? voice.allJokes(seed) : voice.finished(seed)}</Text></FadeIn>}
            <FadeIn delay={900} style={styles.facts}>
              {lifts ? <Text style={[styles.fact, { color: tone.ink }]}>{plural(lifts, 'lift')}</Text> : null}
              {sets ? <Text style={[styles.fact, { color: tone.ink }]}>{plural(sets, 'set')}</Text> : null}
              {card.minutes ? <Text style={[styles.fact, { color: tone.ink }]}>{card.minutes} min</Text> : null}
            </FadeIn>
            {moved >= PLATE_KG ? <FadeIn delay={1100}><Text style={[styles.note, { color: tone.ink }]}>THAT’S {Math.round(moved / PLATE_KG).toLocaleString('en-US')} PLATES OF {PLATE_KG} KG</Text></FadeIn> : null}
            {leftOut.slice(0, SHOWN_LEFT_OUT).map((lift) => <FadeIn key={lift.name} delay={1200}><Text style={[styles.note, { color: tone.ink }]}>{voice.leftOut(lift.name, num(lift.weight), seed).toUpperCase()}</Text></FadeIn>)}
            {leftOut.length > SHOWN_LEFT_OUT ? <FadeIn delay={1220}><Text style={[styles.note, { color: tone.ink }]}>AND {leftOut.length - SHOWN_LEFT_OUT} MORE.</Text></FadeIn> : null}
            {tooMuch ? <FadeIn delay={1230}><Text style={[styles.note, { color: tone.ink }]}>{voice.tooMuch(seed).toUpperCase()}</Text></FadeIn> : null}
            {speedrun ? <FadeIn delay={1250}><Text style={[styles.note, { color: tone.ink }]}>{voice.speedrun(sets, card.minutes ?? 1, seed).toUpperCase()}</Text></FadeIn> : null}
            {medals.length || allJokes || tooMuch ? null : <FadeIn delay={1300}><Text style={[styles.note, { color: tone.ink }]}>{first ? voice.firstSession(seed) : voice.noBest(seed)}</Text></FadeIn>}
            {lost.length ? <FadeIn delay={1350}><Text style={[styles.note, { color: tone.ink }]}>{voice.skipped(lost.length, seed).toUpperCase()}</Text></FadeIn> : null}
            {repeatToday ? <FadeIn delay={1400}><Text style={[styles.note, { color: tone.ink }]}>{voice.again(workout.title, seed).toUpperCase()}</Text></FadeIn> : null}
          </View>
        );
      case 'medals':
        return (
          <View key="medals" style={styles.moment}>
            <Stamp delay={160} style={styles.stamp}><Text style={styles.stampText}>{medals[0]?.place === 1 ? 'NEW BEST' : 'ON THE PODIUM'}</Text></Stamp>
            {medals.slice(0, SHOWN_MEDALS).map((medal, place) => <MedalLine key={medal.entry.id} medal={medal} delay={420 + place * 220} tone={tone} />)}
            {medals.length > SHOWN_MEDALS ? <Muted>And {medals.length - SHOWN_MEDALS} more.</Muted> : null}
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
      case 'history':
        return (
          <View key="history" style={styles.moment}>
            <Text style={[styles.note, { color: tone.soft }]}>{workout.title.toUpperCase()}, {sessions.length} TIMES</Text>
            {changeLabel ? <Text style={[styles.big, { color: tone.ink, fontSize: fitSize(72, changeLabel.length, screenWidth - space.lg * 2), lineHeight: undefined }]}>{changeLabel}</Text> : null}
            <Text style={[styles.unit, { color: tone.ink }]}>{movedChange >= 0 ? '+' : '−'}{Math.abs(movedChange).toLocaleString('en-US')} KG ON LAST TIME</Text>
            <SessionTrend sessions={sessions} workout={workout} ink={tone.ink} faded={tone.track} height={170} />
            <FadeIn delay={900}>
              <Text style={[styles.line, { color: tone.ink }]}>
                {rank === 1 ? voice.biggestYet(workout.title) : movedChange < 0 && rank > 3 ? voice.lighterSession(workout.title, seed) : voice.rankedSession(ordinal(rank), sessions.length, workout.title)}
              </Text>
            </FadeIn>
          </View>
        );
      case 'week':
        return (
          <FadeIn key="week" style={styles.moment}>
            {streak > 1 ? (
              <View style={styles.bigRow}>
                <CountUp value={streak} delay={160} style={[styles.big, { color: colors.volt }]} />
                <Text style={[styles.unit, { color: tone.soft }]}>WEEKS RUNNING</Text>
              </View>
            ) : <Text style={styles.heading}>THIS WEEK</Text>}
            <WeekDots trained={trained} today={today} />
            {streak > 1 ? <Text style={[styles.line, { color: colors.volt }]}>{voice.streak(streak, seed)}</Text> : <Muted>Hit your goal of {plural(target, 'day')} and the streak starts counting.</Muted>}
            {scoreNow > scoreBefore && !(match && opponent) ? (
              <View style={styles.scoreRow}>
                <CountUp value={scoreNow} from={scoreBefore} delay={600} style={[styles.score, { color: tone.ink }]} />
                <Text style={[styles.unit, styles.flex, { color: tone.soft }]}>THIS WEEK’S SCORE, +{scoreNow - scoreBefore} FROM TODAY</Text>
              </View>
            ) : null}
            {match && opponent ? (
              <View style={styles.race}>
                <Text style={[styles.unit, { color: tone.soft }]}>THIS WEEK’S MATCH{gained > 0 ? `, +${gained} FROM TODAY` : ''}</Text>
                {[{ user: me, name: 'You', value: match.myScore, color: colors.volt }, { user: opponent, name: opponent.displayName, value: match.theirScore, color: colors.ink3 }].map((side, place) => (
                  <View key={side.name} style={styles.racer}>
                    <Avatar user={side.user ?? null} size={40} />
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={[styles.racerName, { color: tone.ink }]}>{side.name}</Text>
                      <GrowBar ratio={side.value / Math.max(1, match.myScore, match.theirScore)} color={side.color} delay={700 + place * 150} />
                    </View>
                    <CountUp value={side.value} from={place === 0 ? Math.max(0, side.value - gained) : 0} delay={700 + place * 150} style={[styles.score, { color: tone.ink }]} />
                  </View>
                ))}
                <Text style={[styles.line, { color: colors.volt }]}>
                  {match.myScore > match.theirScore ? voice.matchAhead(opponent.displayName) : match.myScore < match.theirScore ? voice.matchBehind(opponent.displayName) : voice.matchLevel(opponent.displayName)}
                </Text>
              </View>
            ) : null}
          </FadeIn>
        );
      case 'verdict':
        return (
          <View key="verdict" style={styles.moment}>
            <Text style={[styles.heading, { color: tone.ink }]}>THE VERDICT</Text>
            {verdicts.map((call, place) => {
              const look = VERDICTS[call.status]!;
              return (
                <FadeIn key={call.id} delay={place * 200} style={styles.verdict}>
                  <View style={styles.verdictTop}>
                    <Stamp delay={300 + place * 200} style={[styles.stamp, { borderColor: tone.ink }]}>
                      <Text style={[styles.stampText, { color: tone.ink }]}>{look.stamp}</Text>
                    </Stamp>
                    <Pop delay={560 + place * 200}><Text style={[styles.verdictPoints, { color: tone.ink }]}>{look.points}</Text></Pop>
                  </View>
                  <Text style={[styles.line, { color: tone.ink }]}>{look.line(call.exercise)}</Text>
                  <Text style={[styles.note, { color: tone.ink }]}>{call.caller.displayName.toUpperCase()} CALLED IT: “{call.line}”</Text>
                </FadeIn>
              );
            })}
          </View>
        );
      case 'plan':
        return (
          <FadeIn key="plan" style={styles.moment}>
            <Text style={styles.heading}>{unsaved ? 'SAVE THIS WORKOUT?' : `UPDATE ${source?.name.toUpperCase()}?`}</Text>
            <Muted>
              {unsaved
                ? 'Next time it starts with one tap, loaded with your numbers.'
                : lost.length ? `Today had no ${lost.join(', ')}. Updating takes ${lost.length === 1 ? 'it' : 'them'} out of the plan.` : 'Today’s lifts or their order were different from the saved ones.'}
            </Muted>
          </FadeIn>
        );
      default:
        return null;
    }
  };

  const last = scene === 'card';
  const story = scene !== 'plan' && !last;
  return (
    <View style={[styles.host, { backgroundColor: tone.bg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.width}>
        <View style={styles.top}>
          <View style={styles.flex}><StoryBars total={scenes.length} at={at} progress={progress} ink={tone.ink} track={tone.track} /></View>
          {story ? (
            <Pressable accessibilityRole="button" onPress={skip} style={styles.skip}>
              <Text style={[styles.skipText, { color: tone.soft }]}>SKIP</Text>
            </Pressable>
          ) : null}
        </View>

        {last ? (
          <SessionCards
            data={card}
            seed={workout.id}
            primary={<Button title="Show the crew" onPress={() => router.push(`/share?loggedId=${workout.id}`)} />}
            secondary={<Button title="Done" variant="ghost" onPress={done} />}
          />
        ) : story ? (
          <View style={[styles.stage, scene === 'moved' && styles.stageTop]}>
            {show()}
            {scene === 'moved' && moved >= PLATE_KG ? <PlateStacks moved={moved} color={colors.voltInk} /> : null}
            {/* On top, or the pictures would swallow the tap. */}
            <Pressable accessibilityRole="button" accessibilityLabel="Next" delayLongPress={HOLD_TO_PAUSE_MS} onLongPress={() => {}} onPressIn={pressIn} onPressOut={pressOut} onPress={press} style={StyleSheet.absoluteFill} />
          </View>
        ) : <View style={styles.stage}>{show()}</View>}

        {scene === 'plan' ? (
          <View style={styles.footer}>
            {unsaved ? (
              <Button title="Save" onPress={() => {
                createSaved(workout.title, toSavedExercises(workout.entries));
                setHandled(true);
                setScene('card');
                toast('Saved. One less excuse.');
              }} />
            ) : <Button title="Update saved workout" onPress={() => void update()} />}
            <Button title="Not now" variant="ghost" onPress={() => { feel.tap(); setHandled(true); setScene('card'); }} />
          </View>
        ) : null}
        {manual && story ? <View style={styles.footer}><Button title="Next" onPress={() => go(at + 1)} /></View> : null}
      </View>
      {scene === 'medals' && medals[0]?.place === 1 ? <BestFlash /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  host: { flex: 1, paddingHorizontal: space.lg },
  width: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  flash: { backgroundColor: colors.volt },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  skip: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1 },
  stage: { flex: 1, justifyContent: 'center', paddingVertical: space.md },
  stageTop: { justifyContent: 'flex-start', paddingBottom: 0 },
  moment: { gap: space.md },
  footer: { gap: space.sm, paddingTop: space.sm },

  stacks: { flex: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.md },
  stack: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  plate: { height: PLATE_ROW - 4, marginTop: 4, borderRadius: 3 },

  doneStamp: { alignSelf: 'flex-start', marginVertical: space.xs },
  doneWord: { fontFamily: fonts.display, fontSize: 96, lineHeight: 104 },
  bigRow: { gap: 2 },
  big: { fontFamily: fonts.display, fontSize: 72, lineHeight: 90, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 2 },
  line: { fontFamily: fonts.bodyStrong, fontSize: 20, lineHeight: 26 },
  note: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1 },
  facts: { flexDirection: 'row', gap: space.md },
  fact: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  heading: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.volt },
  stamp: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: space.xs, borderWidth: 3, borderColor: colors.volt, borderRadius: 6 },
  stampText: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.volt },

  medal: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  medalLift: { fontFamily: fonts.bodyStrong, fontSize: 17 },
  medalValue: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38 },
  medalWords: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1 },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  score: { minWidth: 44, fontFamily: fonts.display, fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] },
  race: { gap: space.sm, marginTop: space.sm },
  racer: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  racerName: { fontFamily: fonts.bodyStrong, fontSize: 15, marginBottom: 4 },

  verdict: { gap: space.xs },
  verdictTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  verdictPoints: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60 },
});
