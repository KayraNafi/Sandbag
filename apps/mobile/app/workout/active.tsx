import { believableSet, catalogEntry, estimatedMax, exerciseKey, MAX_VARIED_SETS, MAX_WEIGHT, voice } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { BodyMap } from '@/components/BodyMap';
import { toast } from '@/components/Toast';
import { confirm } from '@/components/confirm';
import { DragList, EffortSlider, HoldButton, Stepper } from '@/components/controls';
import { ExercisePicker } from '@/components/ExercisePicker';
import { Icon } from '@/components/icons';
import { LoadView } from '@/components/LoadView';
import { Burst, FadeIn, feel, GrowBar, Pop, prefersLessMotion, Stamp, usePulse } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { Button, Chip, Field, Heading, Label, Muted, Row, Screen, useKeyboardHeight } from '@/components/ui';
import { addExerciseToDraft, finishDraft, reactionTo } from '@/data/actions';
import { useData } from '@/data/store';
import { agoText, backfillDates, clock, dayLabel, nudge, num, plural, round2, summary } from '@/domain/format';
import { activeLogged, bestSetBefore, buildHistory, jumpFor, lastLogged, lastSameWorkout, moveItem, previewLoad, recentWeights, rowsOf, toEntry, volumeOf, warmupSets, weightToBeat, type DraftEntry, type DraftRow } from '@/domain/history';
import { BAR_KG, plateWords } from '@/domain/plates';
import { askForRestAlert, watchRest } from '@/domain/restAlert';
import { colors, fonts, radius, space } from '@/theme';

const NOTE_MAX = 200;
const REST_SECONDS = 90;
const REST_STEP = 30;
/** Skipping this much of the rest gets a comment. */
const SHORT_REST_SECONDS = 15;
const LONG_REST_SECONDS = 5 * 60;
const TINY_WEIGHT = 1;
const LOW_EFFORT = 2;
const MANY_REPS = 50;
/** Past this it isn't rest. */
const MAX_REST_SECONDS = 30 * 60;
const RING = 220;
const RING_LINE = 12;
const FINAL_SECONDS = 3;
/** Up to this many lifts share the width. Past it they keep a readable size and scroll. */
const TRACK_FITS = 3;
const TRACK_ITEM = 112;
/** What gyms actually go up by. Anything odder can be typed straight into the number. */
const JUMPS = [1, 2, 2.5, 5, 10];
/** Under this, a warm-up is just the workout. */
const WARMUP_FROM = 40;
/** Space the title leaves for the clock and the menu. */
const HEADER_RESERVED = 180;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const isFinished = (entry: DraftEntry) => (entry.kind === 'time' ? entry.done : rowsOf(entry).every((row) => row.done));

/** How much of a lift is done, from 0 to 1. */
function shareDone(entry: DraftEntry): number {
  if (entry.kind === 'time') return entry.done ? 1 : 0;
  const rows = rowsOf(entry);
  return rows.length ? rows.filter((row) => row.done).length / rows.length : 0;
}

/** Counts down from a moment, not by ticks, so backgrounding the app can't make it wrong. */
function useSecondsTo(end: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (end === null) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [end]);
  return end === null ? 0 : Math.ceil((end - now) / 1000);
}

function SessionClock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Text style={styles.clock}>{clock(Math.max(0, Math.floor((now - startedAt) / 1000)))}</Text>;
}

/** The whole workout on one line: each lift is its name over its own progress. Tap one to go there. */
function LiftTrack({ entries, focusId, onPick, onAdd }: { entries: DraftEntry[]; focusId: string | null; onPick: (id: string) => void; onAdd: () => void }) {
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const crowded = entries.length > TRACK_FITS;
  const at = entries.findIndex((entry) => entry.id === focusId);
  useEffect(() => {
    if (crowded && at >= 0) scroller.current?.scrollTo({ x: Math.max(0, at - 1) * (TRACK_ITEM + space.sm), animated: !prefersLessMotion() });
  }, [at, crowded]);
  const lifts = entries.map((entry) => {
    const on = entry.id === focusId;
    const finished = isFinished(entry);
    return (
      <Pressable
        key={entry.id}
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}${finished ? ', done' : ''}`}
        accessibilityState={{ selected: on }}
        onPress={() => onPick(entry.id)}
        style={[styles.trackItem, crowded ? styles.trackItemFixed : styles.flex]}
      >
        <GrowBar ratio={shareDone(entry)} color={colors.volt} height={6} />
        <Text numberOfLines={1} style={[styles.trackName, on && styles.trackNameOn]}>{entry.name}</Text>
      </Pressable>
    );
  });
  const addLift = (
    <Pressable accessibilityRole="button" accessibilityLabel="Add a lift" hitSlop={6} onPress={onAdd} style={styles.trackAdd}>
      <Icon name="plus" size={22} color={colors.volt} />
    </Pressable>
  );
  if (!crowded) return <View style={styles.track}>{lifts}{addLift}</View>;
  return (
    <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track} style={styles.trackScroll}>
      {lifts}{addLift}
    </ScrollView>
  );
}

function JumpChips({ name }: { name: string }) {
  const jumps = useData((state) => state.weightJumps);
  const setWeightJump = useData((state) => state.setWeightJump);
  const current = jumpFor(jumps, name);
  return (
    <Row style={styles.wrap}>
      {JUMPS.map((jump) => <Chip key={jump} title={`${num(jump)} kg`} active={current === jump} onPress={() => { feel.tap(); setWeightJump(name, jump); }} />)}
    </Row>
  );
}

/** One mark per set. Tap one to go back and change it, or the last to add another. */
function SetPips({ rows, at, onPick, onAdd }: { rows: DraftRow[]; at: number; onPick: (set: number) => void; onAdd: () => void }) {
  return (
    <View style={styles.pips}>
      {rows.map((row, set) => (
        <Pop key={`${set}-${row.done}`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set ${set + 1}${row.done ? ', done' : ''}`}
            accessibilityState={{ selected: set === at }}
            onPress={() => onPick(set)}
            style={[styles.pip, row.done && styles.pipDone, set === at && styles.pipOn]}
          >
            <Text style={[styles.pipText, row.done && styles.pipTextDone]}>{set + 1}</Text>
          </Pressable>
        </Pop>
      ))}
      {rows.length < MAX_VARIED_SETS ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add set" onPress={onAdd} style={styles.pipAdd}>
          <Icon name="plus" size={18} color={colors.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
}

function RestRing({ seconds, total }: { seconds: number; total: number }) {
  const radiusOf = (RING - RING_LINE) / 2;
  const around = 2 * Math.PI * radiusOf;
  const left = Math.max(0, Math.min(1, seconds / total));
  const offset = useRef(new Animated.Value(around * (1 - left))).current;
  const closing = seconds <= FINAL_SECONDS;
  const kick = usePulse(closing ? seconds : 0, 1.18);
  useEffect(() => {
    if (closing && seconds > 0) feel.tap();
    if (prefersLessMotion()) offset.setValue(around * (1 - left));
    else Animated.timing(offset, { toValue: around * (1 - left), duration: 1000, easing: Easing.linear, useNativeDriver: false }).start();
  }, [seconds, closing, left, around, offset]);
  return (
    <View style={styles.ring} accessibilityLiveRegion="polite" accessibilityLabel={`Rest, ${clock(seconds)} left`}>
      <Svg width={RING} height={RING} style={styles.ringArt}>
        <Circle cx={RING / 2} cy={RING / 2} r={radiusOf} stroke={colors.surface2} strokeWidth={RING_LINE} fill="none" />
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={radiusOf}
          stroke={colors.volt}
          strokeWidth={RING_LINE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={around}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <Animated.Text style={[styles.ringTime, { transform: [{ scale: kick }] }]}>{clock(seconds)}</Animated.Text>
      <Text style={styles.ringLabel}>REST</Text>
    </View>
  );
}

export default function ActiveWorkout() {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight(insets.bottom);
  const draft = useData((state) => state.draft);
  const setDraft = useData((state) => state.setDraft);
  const logged = useData((state) => state.logged);
  const weightJumps = useData((state) => state.weightJumps);
  const index = useMemo(() => buildHistory(activeLogged(logged)), [logged]);
  const known = useMemo(() => [...index.values()].sort((a, b) => b.log.length - a.log.length).map((item) => item.name), [index]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewSet, setViewSet] = useState<number | null>(null);
  const [setupId, setSetupId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [jumpName, setJumpName] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [warmup, setWarmup] = useState<{ weight: number; barbell: boolean; jump: number } | null>(null);
  const [setupMore, setSetupMore] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const me = useSession((state) => state.me);
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(REST_SECONDS);
  const [beatBest, setBeatBest] = useState(false);
  const [fire, setFire] = useState(0);
  const rest = useSecondsTo(restEnd);

  useEffect(() => {
    if (restEnd !== null && rest <= 0) {
      feel.win();
      setRestEnd(null);
      setBeatBest(false);
    }
  }, [rest, restEnd]);

  if (!draft) {
    return (
      <Screen padTop={false}>
        <Heading>Nothing in progress</Heading>
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const allRows = draft.entries.flatMap((entry) => (entry.kind === 'time' ? [{ done: entry.done }] : rowsOf(entry)));
  const doneCount = allRows.filter((row) => row.done).length;
  // One lift at a time: the one asked for, or else the first with something left.
  const focus = draft.entries.find((entry) => entry.id === openId) ?? (openId ? undefined : draft.entries.find((entry) => !isFinished(entry)));
  const focusFinished = focus ? isFinished(focus) : false;
  const resting = restEnd !== null && rest > 0 && !draft.editing && !focusFinished;
  // Follows the end time, so adding 30 seconds moves the alert too.
  const alertAt = resting ? restEnd : null;
  useEffect(() => {
    if (alertAt === null) return undefined;
    askForRestAlert();
    return watchRest(alertAt);
  }, [alertAt]);

  const change = (id: string, changes: Partial<DraftEntry>) =>
    setDraft({ ...draft, entries: draft.entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) });

  const changeRows = (entry: DraftEntry, rows: DraftRow[]) => {
    const numbers = rows.map((row) => row.weight).filter((weight): weight is number => weight !== null);
    change(entry.id, { rows, done: rows.some((row) => row.done), sets: rows.length, weight: numbers.length ? Math.max(...numbers) : null, reps: rows[0]?.reps ?? null });
  };

  const stopResting = () => {
    setRestEnd(null);
    setBeatBest(false);
  };

  const goTo = (id: string | null) => {
    setOpenId(id);
    setViewSet(null);
  };

  const tick = (entry: DraftEntry, set: number) => {
    const rows = rowsOf(entry);
    const row = rows[set];
    if (!row) return;
    // A weighted lift with no weight is someone who forgot the number, not a set worth logging.
    const equipment = catalogEntry(entry.name)?.equipment;
    const needsWeight = equipment ? equipment !== 'bodyweight' : row.reps === null;
    if (row.weight === null && needsWeight) {
      feel.warn();
      toast(voice.needWeight(Date.now()));
      return;
    }
    if (row.reps === 0) {
      feel.warn();
      toast(voice.zeroReps(Date.now()));
      return;
    }
    const next = rows.map((item, position) => (position === set ? { ...item, done: true } : item));
    changeRows(entry, next);
    feel.tick();
    setViewSet(null);

    // Same measure as the rankings, so a stamp here is a new best there too.
    const best = bestSetBefore(index, entry, draft.date);
    const joke = row.weight !== null && !believableSet(entry, row.weight, row.reps);
    const value = row.weight && !joke ? estimatedMax(row.weight, row.reps) : 0;
    const today = rows.filter((item) => item.done && item.weight && believableSet(entry, item.weight, item.reps)).map((item) => estimatedMax(item.weight!, item.reps));
    const isBest = best !== null && value > best && value > Math.max(0, ...today);
    if (isBest) feel.win();
    setBeatBest(isBest);
    // A joke gets no confetti.
    if (joke) {
      feel.warn();
      toast(voice.noWay(num(row.weight!), Date.now()));
    } else {
      setFire((shot) => shot + 1);
      // Only the first set of a lift, or it stops being funny by the third.
      if (!rows.some((item) => item.done)) {
        if (row.weight && row.weight <= TINY_WEIGHT && equipment !== 'bodyweight') toast(voice.tinyWeight(num(row.weight), Date.now()));
        else if (row.weight && row.reps && row.reps >= MANY_REPS) toast(voice.manyReps(row.reps, Date.now()));
      }
    }

    if (!draft.editing) {
      setRestTotal(REST_SECONDS);
      setRestEnd(Date.now() + REST_SECONDS * 1000);
    }
    if (next.every((item) => item.done)) {
      // Stays on this lift to ask how hard it was. The honest-miss rule depends on that answer.
      setOpenId(entry.id);
      const reaction = reactionTo({ ...entry, rows: next }, draft.date);
      if (reaction) toast(reaction);
    }
  };

  const undo = (entry: DraftEntry, set: number) => {
    feel.tap();
    toast(voice.undoSet(Date.now()));
    changeRows(entry, rowsOf(entry).map((row, position) => (position === set ? { ...row, done: false } : row)));
    setViewSet(null);
  };

  /** A new number carries down to the sets not done yet, since that's nearly always what's meant. */
  const editValue = (entry: DraftEntry, set: number, field: 'weight' | 'reps', value: number | null) => {
    changeRows(entry, rowsOf(entry).map((row, position) => (position === set || (position > set && !row.done) ? { ...row, [field]: value } : row)));
  };

  const setCount = (entry: DraftEntry, count: number | null) => {
    if (!count || count < 1) return;
    const rows = rowsOf(entry);
    const copy = rows.at(-1) ?? { weight: null, reps: null, done: false };
    changeRows(entry, count < rows.length ? rows.slice(0, count) : [...rows, ...Array.from({ length: count - rows.length }, () => ({ ...copy, done: false }))]);
    setViewSet(null);
  };

  const add = (name: string) => {
    const next = addExerciseToDraft(draft, name);
    setDraft(next);
    setPicking(false);
    goTo(next.entries.at(-1)?.id ?? null);
    stopResting();
  };

  const finish = () => {
    if (!doneCount) {
      toast('Nothing’s ticked. Bold way to log a workout.');
      return;
    }
    feel.win();
    setMore(false);
    const workout = finishDraft(draft);
    router.replace(`/workout/finished?id=${workout.id}`);
  };

  const discard = async () => {
    const message = draft.editing ? 'Your changes will be lost. The logged session stays.' : voice.discard();
    setMore(false);
    if (await confirm('Discard this workout?', message, 'Discard')) {
      setDraft(null);
      router.back();
    }
  };

  // What's moved so far against last time, for something to look at while resting.
  const movedSoFar = volumeOf({ entries: draft.entries.filter((entry) => entry.done).map(toEntry) });
  const lastSession = lastSameWorkout(activeLogged(logged), { id: draft.id, date: draft.date, title: draft.title, savedWorkoutId: draft.savedWorkoutId, entries: [], updatedAt: 0, deleted: false });
  const movedLastTime = lastSession ? volumeOf(lastSession) : 0;

  const setupEntry = setupId ? draft.entries.find((entry) => entry.id === setupId) : undefined;
  const nextRow = focus && focus.kind !== 'time' ? rowsOf(focus).find((row) => !row.done) : undefined;

  /** What's on screen now, and the one thing to press. The button always sits under the thumb. */
  const stage = (): { body: ReactNode; action: ReactNode } => {
    if (!draft.entries.length) {
      return {
        body: (
          <FadeIn key="empty" style={styles.center}>
            <Text style={styles.allDone}>WHAT ARE YOU LIFTING?</Text>
            <Muted style={styles.middle}>Pick your first lift. Nothing’s logged until you finish a set.</Muted>
          </FadeIn>
        ),
        action: <Button title="Add a lift" onPress={() => setPicking(true)} style={styles.done} />,
      };
    }

    if (!focus) {
      return {
        body: (
          <FadeIn key="all-done" style={styles.center}>
            <BodyMap size={110} margins={40} levels={previewLoad(draft.entries.filter((entry) => entry.done))} />
            <Stamp delay={120} style={styles.stamp}><Text style={styles.stampText}>THAT’S ALL</Text></Stamp>
            <Text style={styles.allDone}>{plural(doneCount, 'set')} done.</Text>
            <Muted style={styles.middle}>{voice.allDone(doneCount)}</Muted>
          </FadeIn>
        ),
        action: draft.editing
          ? <Button title="Save changes" onPress={finish} style={styles.done} />
          : <HoldButton title="Hold to finish" onDone={finish} />,
      };
    }

    if (resting) {
      return {
        body: (
          <FadeIn key="rest" style={styles.center}>
            {beatBest ? <Stamp delay={120} style={styles.stamp}><Text style={styles.stampText}>NEW BEST</Text></Stamp> : null}
            <RestRing seconds={rest} total={restTotal} />
            <Muted style={styles.middle}>{restTotal >= LONG_REST_SECONDS ? voice.longRest(doneCount) : voice.rest(doneCount)}</Muted>
            <Text style={styles.upNext}>Up next: {focus.name}{nextRow?.weight ? `, ${num(nextRow.weight)} kg × ${nextRow.reps ?? '–'}` : ''}</Text>
            {movedLastTime ? (
              <View style={styles.race}>
                <GrowBar ratio={movedSoFar / movedLastTime} color={movedSoFar >= movedLastTime ? colors.volt : colors.chart} height={8} />
                <Text style={styles.raceText}>{movedSoFar.toLocaleString('en-US')} KG SO FAR · {movedSoFar >= movedLastTime ? 'PAST LAST TIME' : `${movedLastTime.toLocaleString('en-US')} LAST TIME`}</Text>
              </View>
            ) : null}
          </FadeIn>
        ),
        action: (
          <>
            <Button title="I’m ready" onPress={() => {
              feel.tap();
              if (restTotal - rest < SHORT_REST_SECONDS) toast(voice.shortRest(Date.now()));
              stopResting();
            }} style={styles.done} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add ${REST_STEP} seconds`}
              hitSlop={8}
              onPress={() => {
                if (rest + REST_STEP > MAX_REST_SECONDS) {
                  toast(voice.noNap(Date.now()));
                  return;
                }
                feel.tap();
                setRestTotal((total) => total + REST_STEP);
                setRestEnd((end) => (end ?? Date.now()) + REST_STEP * 1000);
              }}
              style={styles.link}
            >
              <Text style={styles.linkText}>+{REST_STEP} seconds</Text>
            </Pressable>
          </>
        ),
      };
    }

    const rows = rowsOf(focus);
    const set = viewSet ?? rows.findIndex((row) => !row.done);
    const row = rows[set];
    const last = lastLogged(index, focus.name, draft.date);
    const head = (
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${focus.name} setup`} onPress={() => { feel.tap(); setSetupId(focus.id); }} style={styles.nameRow}>
          <Text style={styles.liftName}>{focus.name}</Text>
          <Icon name="chevron" size={18} color={colors.ink3} />
        </Pressable>
        <Muted numberOfLines={2}>{last ? `${agoText(last.date)[0]?.toUpperCase()}${agoText(last.date).slice(1)}: ${summary({ ...last, rpe: null })}` : 'First time. Start light.'}</Muted>
        {focus.note ? <Muted numberOfLines={1}>{focus.note}</Muted> : null}
      </View>
    );

    if (focus.kind === 'time') {
      return {
        body: (
          <FadeIn key={focus.id} style={styles.stage}>
            {head}
            <Stepper label="Minutes" unit="min" value={focus.minutes} step={5} max={1440} onChange={(minutes) => change(focus.id, { minutes })} />
          </FadeIn>
        ),
        action: <Button title={focus.done ? 'Not done' : 'Done'} variant={focus.done ? 'ghost' : 'primary'} style={styles.done} onPress={() => {
          if (!focus.done) feel.tick();
          change(focus.id, { done: !focus.done });
          if (!focus.done) goTo(null);
        }} />,
      };
    }

    const pips = (
      <SetPips
        rows={rows}
        at={set}
        onPick={(picked) => { feel.tap(); setViewSet(picked); }}
        onAdd={() => { feel.tap(); setCount(focus, rows.length + 1); }}
      />
    );

    if (focusFinished && viewSet === null) {
      const moreLeft = draft.entries.some((other) => other.id !== focus.id && !isFinished(other));
      return {
        body: (
          <FadeIn key={`${focus.id}-effort`} style={styles.stage}>
            {head}
            <View style={styles.picture}>
              {Object.keys(previewLoad([{ name: focus.name }])).length ? <BodyMap key={focus.id} size={84} margins={40} levels={previewLoad([{ name: focus.name }])} /> : null}
              {beatBest ? <Stamp delay={120} style={styles.stamp}><Text style={styles.stampText}>NEW BEST</Text></Stamp> : null}
            </View>
            {pips}
            <EffortSlider value={focus.rpe} onChange={(rpe) => {
              if (rpe === 10 && focus.rpe !== 10) toast(voice.rpeTen(Date.now()));
              else if (rpe !== null && rpe <= LOW_EFFORT && (focus.rpe === null || focus.rpe > LOW_EFFORT)) toast(voice.rpeLow(Date.now()));
              change(focus.id, { rpe });
            }} />
          </FadeIn>
        ),
        action: <Button title={moreLeft ? 'Next lift' : 'That’s everything'} onPress={() => { feel.tap(); goTo(null); }} style={styles.done} />,
      };
    }

    if (!row) return { body: null, action: null };
    const equipment = catalogEntry(focus.name)?.equipment;
    const onTheBar = (row.weight ?? 0) * (focus.perSide ? 2 : 1);
    const best = bestSetBefore(index, focus, draft.date);
    const jump = jumpFor(weightJumps, focus.name);
    // More than anyone's lifted. Most likely a slipped zero, so that's offered as the way out.
    const joke = !row.done && row.reps !== 0 && Boolean(row.weight) && !believableSet(focus, row.weight!, row.reps);
    const beating = !row.done && !joke && row.reps !== 0 && best !== null && row.weight !== null && estimatedMax(row.weight, row.reps) > best;
    const toBeat = !row.done && !beating && !joke && best !== null && row.weight ? weightToBeat(row.weight, row.reps, jump, best) : null;
    const worked = previewLoad([{ name: focus.name }]);
    // Someone called this lift: the number that matters today is theirs, not your best.
    const called = !row.done && !joke ? calls.data?.find((call) => call.status === 'open' && call.target.id === me?.id && call.targetWeight !== null && exerciseKey(call.exercise) === exerciseKey(focus.name)) : undefined;
    const clears = called && row.reps !== 0 && row.weight !== null && estimatedMax(row.weight, row.reps) > estimatedMax(called.targetWeight!, called.targetReps);
    const barbell = equipment === 'barbell' && focus.includesEquipment !== false;
    const canWarmUp = !joke && !draft.editing && set === 0 && !rows.some((item) => item.done) && (row.weight ?? 0) >= WARMUP_FROM && equipment && equipment !== 'bodyweight';
    return {
      body: (
        <FadeIn key={`${focus.id}-${set}`} style={styles.stage}>
          {head}
          {canWarmUp ? (
            <Pressable accessibilityRole="button" accessibilityLabel="See warm-up sets" onPress={() => { feel.tap(); setWarmup({ weight: row.weight!, barbell, jump }); }} style={styles.warmLink}>
              <Text style={styles.linkText}>Warm up first</Text>
              <Icon name="chevron" size={14} color={colors.volt} />
            </Pressable>
          ) : null}
          {/* What to load is the picture that helps at the rack. With nothing to load, it's what this works. */}
          <View style={styles.picture}>
            {onTheBar && equipment && equipment !== 'bodyweight'
              ? <LoadView weight={onTheBar} equipment={equipment} />
              : Object.keys(worked).length ? <BodyMap key={focus.id} size={72} margins={40} levels={worked} /> : null}
          </View>
          <View style={styles.target}>
            {joke ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${num(row.weight!)} kilos is more than anyone has lifted. Fix it.`}
                onPress={() => {
                  feel.tap();
                  const smaller = round2(row.weight! / 10);
                  editValue(focus, set, 'weight', believableSet(focus, smaller, row.reps) ? smaller : null);
                }}
                style={styles.targetTry}
              >
                <Icon name="target" size={16} color={colors.danger} />
                <Text style={[styles.targetText, styles.targetJoke]}>THAT’S A WORLD RECORD. TYPO?</Text>
              </Pressable>
            ) : null}
            {called ? (
              clears ? <Stamp key="cleared"><Text style={styles.targetStamp}>THAT BEATS THE CALL</Text></Stamp> : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Called by ${called.caller.displayName}. Load ${num(called.targetWeight!)} kilos plus one jump.`}
                  onPress={() => {
                    feel.warn();
                    const load = nudge(called.targetWeight!, jump);
                    changeRows(focus, rows.map((item, position) => (position === set || (position > set && !item.done) ? { ...item, weight: load, reps: called.targetReps ?? item.reps } : item)));
                  }}
                  style={styles.targetTry}
                >
                  <Icon name="target" size={16} color={colors.warn} />
                  <Text style={[styles.targetText, styles.targetCall]}>CALLED: BEAT {num(called.targetWeight!)} KG{called.targetReps ? ` × ${called.targetReps}` : ''}</Text>
                </Pressable>
              )
            ) : null}
            {!called && beating ? <Stamp key="best"><Text style={styles.targetStamp}>THAT’S A NEW BEST</Text></Stamp> : null}
            {!called && toBeat !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Try ${num(toBeat)} kilos for a new best`}
                onPress={() => { feel.tap(); editValue(focus, set, 'weight', toBeat); }}
                style={styles.targetTry}
              >
                <Icon name="target" size={16} color={colors.volt} />
                <Text style={styles.targetText}>TRY {num(toBeat)} KG FOR A NEW BEST</Text>
              </Pressable>
            ) : null}
          </View>
          {pips}
          <View style={styles.dials}>
            <View style={styles.flex}><Stepper compact label="Weight" unit="kg" value={row.weight} step={jumpFor(weightJumps, focus.name)} startAt={barbell ? BAR_KG : undefined} max={MAX_WEIGHT} onStepPress={() => { feel.tap(); setJumpName(focus.name); }} onChange={(value) => editValue(focus, set, 'weight', value)} /></View>
            <View style={styles.flex}><Stepper compact label="Reps" value={row.reps} step={1} max={1000} decimals={false} onChange={(value) => editValue(focus, set, 'reps', value)} /></View>
          </View>
        </FadeIn>
      ),
      action: row.done ? (
        <>
          <Button title="Keep it" onPress={() => { feel.tap(); setViewSet(null); }} />
          <Button title="Undo this set" variant="ghost" onPress={() => undo(focus, set)} />
        </>
      ) : (
        <Button title={`Set ${set + 1} of ${rows.length} done`} onPress={() => tick(focus, set)} style={styles.done} />
      ),
    };
  };

  const { body, action } = stage();

  return (
    <View style={[styles.host, { paddingBottom: keyboard }]}>
      <Stack.Screen
        options={{
          headerTitle: () => <Text numberOfLines={1} style={[styles.headerTitle, { maxWidth: screenWidth - HEADER_RESERVED }]}>{draft.title}</Text>,
          headerRight: () => (
            <View style={styles.headerRight}>
              {draft.startedAt && !draft.editing ? <SessionClock startedAt={draft.startedAt} /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={6} onPress={() => setMore(true)} style={styles.iconButton}>
                <Icon name="more" size={26} color={colors.ink} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {draft.entries.length ? (
          <LiftTrack
            entries={draft.entries}
            focusId={focus?.id ?? null}
            onPick={(id) => { feel.tap(); stopResting(); goTo(id); }}
            onAdd={() => setPicking(true)}
          />
        ) : null}
        {body}
      </ScrollView>
      {action ? <View style={[styles.action, { paddingBottom: keyboard ? space.md : insets.bottom + space.md }]}>{action}</View> : null}

      <ExercisePicker
        visible={picking}
        recent={known}
        exclude={new Set(draft.entries.map((entry) => entry.name))}
        onPick={add}
        onClose={() => setPicking(false)}
      />

      <Sheet visible={Boolean(setupEntry)} onClose={() => setSetupId(null)} title={setupEntry ? `${setupEntry.name} setup` : ''} footer={<Button title="Done" onPress={() => setSetupId(null)} />}>
        {setupEntry ? (
          <>
            <BodyMap size={120} margins={40} levels={previewLoad([{ name: setupEntry.name }])} />
            <Muted>Remembered for next time, so this only needs setting once.</Muted>
            {setupEntry.kind === 'strength' ? (
              <>
                <Stepper label="Sets" value={rowsOf(setupEntry).length} step={1} max={MAX_VARIED_SETS} decimals={false} onChange={(count) => setCount(setupEntry, count)} />
                {recentWeights(index, setupEntry.name).length > 1 ? (
                  <>
                    <Label>Weights you’ve used</Label>
                    <Row style={styles.wrap}>
                      {recentWeights(index, setupEntry.name).map((weight) => (
                        <Chip key={weight} title={num(weight)} active={rowsOf(setupEntry).find((row) => !row.done)?.weight === weight} onPress={() => {
                          const open = rowsOf(setupEntry).findIndex((row) => !row.done);
                          if (open >= 0) editValue(setupEntry, open, 'weight', weight);
                        }} />
                      ))}
                    </Row>
                  </>
                ) : null}
              </>
            ) : null}
            {setupEntry.kind === 'strength' ? (
              <>
                <Label>Weight jumps</Label>
                <JumpChips name={setupEntry.name} />
              </>
            ) : null}
            <Field label="Note" placeholder="Seat at 4" maxLength={NOTE_MAX} value={setupEntry.note} onChangeText={(note) => change(setupEntry.id, { note })} />
            {setupMore || setupEntry.kind === 'time' ? (
              <>
                <Label>What is it?</Label>
                <Row style={styles.wrap}>
                  <Chip title="Weights" active={setupEntry.kind === 'strength'} onPress={() => change(setupEntry.id, { kind: 'strength' })} />
                  <Chip title="Timed" active={setupEntry.kind === 'time'} onPress={() => change(setupEntry.id, { kind: 'time' })} />
                </Row>
              </>
            ) : <Button title="More settings" variant="ghost" onPress={() => { feel.tap(); setSetupMore(true); }} />}
            {setupMore && setupEntry.kind === 'strength' ? (
              <>
                <Label>The weight you enter is</Label>
                <Row style={styles.wrap}>
                  <Chip title="The total" active={!setupEntry.perSide} onPress={() => change(setupEntry.id, { perSide: false })} />
                  <Chip title="Each side" active={setupEntry.perSide} onPress={() => change(setupEntry.id, { perSide: true })} />
                </Row>
                <Label>Bar or machine weight</Label>
                <Row style={styles.wrap}>
                  <Chip title="Included" active={setupEntry.includesEquipment === true} onPress={() => change(setupEntry.id, { includesEquipment: setupEntry.includesEquipment === true ? undefined : true })} />
                  <Chip title="Not included" active={setupEntry.includesEquipment === false} onPress={() => change(setupEntry.id, { includesEquipment: setupEntry.includesEquipment === false ? undefined : false })} />
                </Row>
                <Muted>Changing these starts this lift’s progress again, because the numbers no longer compare.</Muted>
              </>
            ) : null}
            <Button title="Remove from today" variant="danger" onPress={() => {
              setDraft({ ...draft, entries: draft.entries.filter((item) => item.id !== setupEntry.id) });
              setSetupId(null);
              goTo(null);
            }} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={Boolean(warmup)} onClose={() => setWarmup(null)} title="Warm up" footer={<Button title="Got it" onPress={() => setWarmup(null)} />}>
        <Muted>The way up to {warmup ? num(warmup.weight) : ''} kg. None of it gets logged, because nobody’s counting these.</Muted>
        {warmup ? warmupSets(warmup.weight, warmup.jump, warmup.barbell ? BAR_KG : 0).map((step) => (
          <View key={step.weight} style={styles.warmRow}>
            <Text style={styles.warmValue}>{num(step.weight)} × {step.reps}</Text>
            {warmup.barbell ? <Text style={styles.warmPlates}>{plateWords(step.weight)}</Text> : null}
          </View>
        )) : null}
      </Sheet>

      <Sheet visible={Boolean(jumpName)} onClose={() => setJumpName(null)} title="Weight jumps" footer={<Button title="Done" onPress={() => setJumpName(null)} />}>
        <Muted>The smallest step {jumpName ?? 'this lift'} can go up by at your gym. Other lifts on the same kit start from it.</Muted>
        {jumpName ? <JumpChips name={jumpName} /> : null}
        <Muted>Something odder, like 4.5 kg? Tap the number and type it.</Muted>
      </Sheet>

      <Sheet visible={more} onClose={() => setMore(false)} title="This workout" footer={<Button title="Done" onPress={() => setMore(false)} />}>
        {doneCount && focus ? <Button title={draft.editing ? 'Save changes' : `Finish now, ${doneCount} of ${allRows.length} sets`} variant="ghost" onPress={finish} /> : null}
        <Field label="Name" maxLength={100} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} />
        {!draft.editing ? (
          <>
            <Label>Which day?</Label>
            <Muted>Forgot to log one? Pick the day you trained.</Muted>
            <Row style={styles.wrap}>
              {backfillDates().map((date) => <Chip key={date} title={dayLabel(date)} active={date === draft.date} onPress={() => setDraft({ ...draft, date })} />)}
            </Row>
          </>
        ) : null}
        {draft.entries.length > 1 ? (
          <>
            <Label>Order</Label>
            <DragList
              items={draft.entries}
              keyOf={(entry) => entry.id}
              label={(entry) => entry.name}
              renderItem={(entry) => <View style={styles.orderRow}><Text style={styles.name}>{entry.name}</Text></View>}
              onMove={(from, to) => {
                let entries = draft.entries;
                for (let at = from; at !== to; at += to > from ? 1 : -1) entries = moveItem(entries, at, to > from ? 1 : -1);
                setDraft({ ...draft, entries });
              }}
            />
          </>
        ) : null}
        <Button title="Discard workout" variant="danger" onPress={discard} />
      </Sheet>
      <Burst fire={fire} big={beatBest} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flexWrap: 'wrap' },
  host: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  action: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  headerTitle: { fontFamily: fonts.label, fontSize: 18, color: colors.ink },
  warmLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', minHeight: 44 },
  warmRow: { gap: 2, paddingVertical: space.sm },
  warmValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  warmPlates: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink3 },
  targetCall: { color: colors.warn },
  targetJoke: { color: colors.danger },
  clock: { fontFamily: fonts.display, fontSize: 20, color: colors.ink2, fontVariant: ['tabular-nums'] },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },

  track: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  trackScroll: { flexGrow: 0 },
  trackItem: { gap: space.xs, minHeight: 44, paddingTop: space.xs },
  trackItemFixed: { width: TRACK_ITEM },
  trackName: { fontFamily: fonts.label, fontSize: 15, color: colors.ink3 },
  trackNameOn: { color: colors.ink },
  trackAdd: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  stage: { flex: 1, gap: space.md },
  head: { gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', maxWidth: '100%' },
  liftName: { flexShrink: 1, fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.ink },
  picture: { flex: 1, minHeight: 88, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  dials: { flexDirection: 'row', gap: space.md },
  target: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  targetStamp: { paddingHorizontal: space.sm, fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.volt },
  targetTry: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingHorizontal: space.md },
  targetText: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.volt },
  race: { alignSelf: 'stretch', gap: space.xs, marginTop: space.sm },
  raceText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink3, textAlign: 'center' },

  pips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  pip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.surface2 },
  pipDone: { backgroundColor: colors.volt, borderColor: colors.volt },
  pipOn: { borderColor: colors.volt },
  pipText: { fontFamily: fonts.display, fontSize: 17, color: colors.ink2 },
  pipTextDone: { color: colors.voltInk },
  pipAdd: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  done: { minHeight: 72 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  middle: { textAlign: 'center' },
  allDone: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.ink, textAlign: 'center' },
  upNext: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink, textAlign: 'center' },
  stamp: { alignSelf: 'center', paddingHorizontal: space.md, paddingVertical: space.xs, borderWidth: 3, borderColor: colors.volt, borderRadius: 6 },
  stampText: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, color: colors.volt },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringArt: { position: 'absolute', top: 0, left: 0 },
  ringTime: { fontFamily: fonts.display, fontSize: 56, lineHeight: 70, color: colors.volt, fontVariant: ['tabular-nums'] },
  ringLabel: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.ink3 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt },
  orderRow: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
});
