import { estimatedMax, exerciseKey, findLift, MAX_WEIGHT, voice } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { EffortSlider } from '@/components/EffortSlider';
import { HoldButton } from '@/components/HoldButton';
import { Icon } from '@/components/icons';
import { LoadView } from '@/components/LoadView';
import { Burst, FadeIn, feel, GrowBar, Stamp } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { toast } from '@/components/Toast';
import { Button, Muted, Row, useKeyboardHeight } from '@/components/ui';
import { reactionTo } from '@/data/actions';
import { jumpFor, usePrefs } from '@/data/prefs';
import { useData } from '@/data/store';
import { agoText, nudge, num, plural, round2, summary } from '@/domain/format';
import { activeLogged, bestSetBefore, buildHistory, lastLogged, lastSessionOf, volumeOf, weightToBeat, type Draft, type DraftEntry } from '@/domain/history';
import { canMarkDrops, dropsOf, dropWeight, setAt, setMax, tickedCount, ticksOf, toEntry, withDone, withDrop, withSetCount, withSetValue, withTick } from '@/domain/sets';
import { colors, fonts, space } from '@/theme';
import { askForRestAlert, watchRest } from './restAlert';
import { isFinished, LiftTrack, RestRing, SessionClock, SetPips, useSecondsTo } from './StepParts';
import { JumpSheet, LiftSheet, WarmupSheet, WorkoutSheet } from './StepSheets';
import { AddLift, useWorkout } from './workout';

const REST_SECONDS = 90;
const REST_STEP = 30;
/** Skipping this much of the rest gets a comment. */
const SHORT_REST_SECONDS = 15;
const LONG_REST_SECONDS = 5 * 60;
/** Past this it isn't rest. */
const MAX_REST_SECONDS = 30 * 60;
const TINY_WEIGHT = 1;
const LOW_EFFORT = 2;
const MANY_REPS = 50;
/** Below this a warm-up is just the work. */
const WARMUP_FROM = 40;
/** Room the header keeps for the back arrow, the clock and the menu. */
const HEADER_RESERVED = 180;

/** Sets ticked across the workout, and how many there are. Timed work counts as one. */
function setTotals(entries: DraftEntry[]): { done: number; all: number } {
  return entries.reduce((sum, entry) => (entry.kind === 'time'
    ? { done: sum.done + Number(entry.done), all: sum.all + 1 }
    : { done: sum.done + tickedCount(entry), all: sum.all + ticksOf(entry).length }), { done: 0, all: 0 });
}

/** One lift at a time, one set at a time, with a rest between sets. */
export function StepLog({ draft }: { draft: Draft }) {
  const workout = useWorkout(draft);
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight(insets.bottom);
  const { width: screenWidth } = useWindowDimensions();
  const logged = useData((state) => state.logged);
  const jumps = usePrefs((state) => state.jumps);
  const setLogging = usePrefs((state) => state.setLogging);
  const me = useSession((state) => state.me);
  const calls = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const all = useMemo(() => activeLogged(logged), [logged]);
  const index = useMemo(() => buildHistory(all), [all]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [viewSet, setViewSet] = useState<number | null>(null);
  const [setupId, setSetupId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [jumpName, setJumpName] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [warmup, setWarmup] = useState<{ weight: number; jump: number } | null>(null);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(REST_SECONDS);
  const [beatBest, setBeatBest] = useState(false);
  const [fire, setFire] = useState(0);
  /** A set being taken to failure and dropped, and how many drops so far. */
  const [dropping, setDropping] = useState<{ id: string; set: number; drops: number } | null>(null);
  const rest = useSecondsTo(restEnd);

  useEffect(() => {
    if (restEnd !== null && rest <= 0) {
      feel.win();
      setRestEnd(null);
      setBeatBest(false);
    }
  }, [rest, restEnd]);

  const totals = setTotals(draft.entries);
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

  const stopResting = () => {
    setRestEnd(null);
    setBeatBest(false);
  };
  const goTo = (id: string | null) => {
    setOpenId(id);
    setViewSet(null);
    setDropping(null);
  };
  /** A new number carries to the sets not done yet, since that's nearly always what's meant. */
  const editValue = (entry: DraftEntry, set: number, field: 'weight' | 'reps', value: number | null) =>
    workout.update(entry.id, withSetValue(entry, set, field, value, { onward: true, fold: true }));

  const tick = (entry: DraftEntry, set: number, drop = false) => {
    const { weight, reps } = setAt(entry, set);
    // Nothing in at all is someone who forgot the number, not a set worth logging.
    if (weight === null && reps === null) {
      feel.warn();
      toast(voice.needWeight(Date.now()));
      return;
    }
    if (reps === 0) {
      feel.warn();
      toast(voice.zeroReps(Date.now()));
      return;
    }
    const first = tickedCount(entry) === 0;
    const changes = { ...withTick(entry, set, true), ...(drop ? withDrop(entry, set, true) : {}) };
    const ticked = { ...entry, ...changes };
    workout.update(entry.id, changes);
    feel.tick();
    setViewSet(null);
    setDropping(null);

    // Same measure as the rankings, so a stamp here is a new best there too.
    const best = bestSetBefore(index, entry, draft.date);
    const value = weight ? setMax(entry, weight, reps) : null;
    const joke = Boolean(weight) && value === null;
    const today = ticksOf(entry).flatMap((done, position) => {
      const other = setAt(entry, position);
      const max = done && other.weight ? setMax(entry, other.weight, other.reps) : null;
      return max === null ? [] : [max];
    });
    const isBest = best !== null && value !== null && value > best && value > Math.max(0, ...today);
    if (isBest) feel.win();
    setBeatBest(isBest);
    // A joke gets no confetti.
    if (joke) {
      feel.warn();
      toast(voice.noWay(num(weight!), Date.now()));
    } else {
      setFire((shot) => shot + 1);
      // Only the first set of a lift, or it stops being funny by the third.
      if (first) {
        if (weight && weight <= TINY_WEIGHT) toast(voice.tinyWeight(num(weight), Date.now()));
        else if (weight && reps && reps >= MANY_REPS) toast(voice.manyReps(reps, Date.now()));
      }
    }

    if (!draft.editing) {
      setRestTotal(REST_SECONDS);
      setRestEnd(Date.now() + REST_SECONDS * 1000);
    }
    if (isFinished(ticked)) {
      // Stays on this lift to ask how hard it was. The honest-miss rule depends on that answer.
      setOpenId(entry.id);
      const reaction = reactionTo(ticked, draft.date);
      if (reaction) toast(reaction);
    }
  };

  const undo = (entry: DraftEntry, set: number) => {
    feel.tap();
    toast(voice.undoSet(Date.now()));
    workout.update(entry.id, { ...withTick(entry, set, false), ...withDrop(entry, set, false) });
    setViewSet(null);
  };

  const add = (name: string) => {
    const id = workout.add(name);
    setPicking(false);
    goTo(id);
    stopResting();
  };

  // What's moved so far against last time, for something to look at while resting.
  const movedSoFar = volumeOf({ entries: draft.entries.filter((entry) => entry.done).map(toEntry) });
  const lastSession = lastSessionOf(all, draft);
  const movedLastTime = lastSession ? volumeOf(lastSession) : 0;
  const setupEntry = setupId ? draft.entries.find((entry) => entry.id === setupId) : undefined;
  const nextSet = focus && focus.kind !== 'time' ? ticksOf(focus).findIndex((done) => !done) : -1;
  const next = focus && nextSet >= 0 ? setAt(focus, nextSet) : null;

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
            <Stamp delay={120} style={styles.stamp}><Text style={styles.stampText}>THAT’S ALL</Text></Stamp>
            <Text style={styles.allDone}>{plural(totals.done, 'set')} done.</Text>
            <Muted style={styles.middle}>{voice.allDone(totals.done)}</Muted>
          </FadeIn>
        ),
        action: draft.editing
          ? <Button title="Save changes" onPress={workout.finish} style={styles.done} />
          : <HoldButton title="Hold to finish" onDone={workout.finish} />,
      };
    }

    if (resting) {
      return {
        body: (
          <FadeIn key="rest" style={styles.center}>
            {beatBest ? <Stamp delay={120} style={styles.stamp}><Text style={styles.stampText}>NEW BEST</Text></Stamp> : null}
            <RestRing seconds={rest} total={restTotal} />
            <Muted style={styles.middle}>{restTotal >= LONG_REST_SECONDS ? voice.longRest(totals.done) : voice.rest(totals.done)}</Muted>
            <Text style={styles.upNext}>Up next: {focus.name}{next?.weight ? `, ${num(next.weight)} kg × ${next.reps ?? '–'}` : ''}</Text>
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

    const last = lastLogged(index, focus.name, draft.date);
    const ago = last ? agoText(last.date) : '';
    const head = (
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${focus.name} setup`} onPress={() => { feel.tap(); setSetupId(focus.id); }} style={styles.nameRow}>
          <Text style={styles.liftName}>{focus.name}</Text>
          <Icon name="chevron" size={18} color={colors.ink3} />
        </Pressable>
        <Muted numberOfLines={2}>{last ? `${ago[0]?.toUpperCase()}${ago.slice(1)}: ${summary({ ...last, rpe: null })}` : 'First time. Start light.'}</Muted>
        {focus.note ? <Muted numberOfLines={1}>{focus.note}</Muted> : null}
      </View>
    );

    if (focus.kind === 'time') {
      return {
        body: (
          <FadeIn key={focus.id} style={styles.stage}>
            {head}
            <Stepper variant="large" label="Minutes" unit="min" value={focus.minutes} step={5} max={1440} onChange={(minutes) => workout.update(focus.id, { minutes })} />
          </FadeIn>
        ),
        action: <Button title={focus.done ? 'Not done' : 'Done'} variant={focus.done ? 'ghost' : 'primary'} style={styles.done} onPress={() => {
          if (!focus.done) feel.tick();
          workout.update(focus.id, withDone(!focus.done));
          if (!focus.done) goTo(null);
        }} />,
      };
    }

    const ticks = ticksOf(focus);
    const set = viewSet ?? ticks.findIndex((done) => !done);
    const pips = (
      <SetPips
        ticks={ticks}
        at={set}
        onPick={(picked) => { feel.tap(); setViewSet(picked); }}
        onAdd={() => { feel.tap(); workout.update(focus.id, withSetCount(focus, ticks.length + 1)); setViewSet(null); }}
      />
    );

    if (focusFinished && viewSet === null) {
      const moreLeft = draft.entries.some((other) => other.id !== focus.id && !isFinished(other));
      return {
        body: (
          <FadeIn key={`${focus.id}-effort`} style={styles.stage}>
            {head}
            <View style={styles.picture}>
              {beatBest ? <Stamp delay={120} style={styles.stamp}><Text style={styles.stampText}>NEW BEST</Text></Stamp> : null}
            </View>
            {pips}
            <EffortSlider value={focus.rpe} onChange={(rpe) => {
              if (rpe === 10 && focus.rpe !== 10) toast(voice.rpeTen(Date.now()));
              else if (rpe <= LOW_EFFORT && (focus.rpe === null || focus.rpe > LOW_EFFORT)) toast(voice.rpeLow(Date.now()));
              workout.update(focus.id, { rpe });
            }} />
          </FadeIn>
        ),
        action: <Button title={moreLeft ? 'Next lift' : 'That’s everything'} onPress={() => { feel.tap(); goTo(null); }} style={styles.done} />,
      };
    }

    if (set < 0) return { body: null, action: null };
    const done = ticks[set] ?? false;
    const { weight, reps } = setAt(focus, set);
    const best = bestSetBefore(index, focus, draft.date);
    const jump = jumpFor(jumps, focus.name);
    const max = weight ? setMax(focus, weight, reps) : null;
    // More than anyone's lifted. Most likely a slipped zero, so that's offered as the way out.
    const joke = !done && reps !== 0 && Boolean(weight) && max === null;
    const beating = !done && reps !== 0 && best !== null && max !== null && max > best;
    const toBeat = !done && !beating && !joke && best !== null && weight ? weightToBeat(weight, reps, jump, best) : null;
    // Someone called this lift: the number that matters today is theirs, not your best.
    const called = !done && !joke ? calls.data?.find((call) => call.status === 'open' && call.target.id === me?.id && call.targetWeight !== null && exerciseKey(call.exercise) === exerciseKey(focus.name)) : undefined;
    const clears = called && reps !== 0 && weight !== null && estimatedMax(weight, reps) > estimatedMax(called.targetWeight!, called.targetReps);
    const kit = findLift(focus.name)?.kit;
    const drop = dropping && dropping.id === focus.id && dropping.set === set && !done ? dropping : null;
    // Past the smallest jump there's nothing lighter to suggest, only an opinion.
    const dropTo = drop && weight ? dropWeight(weight, jump, drop.drops) : null;
    const bottomedOut = dropTo !== null && dropTo <= jump;
    const wasDrop = done && (dropsOf(focus)[set] ?? false);
    const canWarmUp = !drop && !joke && !draft.editing && set === 0 && tickedCount(focus) === 0 && (weight ?? 0) >= WARMUP_FROM;
    return {
      body: (
        <FadeIn key={`${focus.id}-${set}`} style={styles.stage}>
          {head}
          {canWarmUp ? (
            <Pressable accessibilityRole="button" accessibilityLabel="See warm-up sets" onPress={() => { feel.tap(); setWarmup({ weight: weight!, jump }); }} style={styles.warmLink}>
              <Text style={styles.linkText}>Warm up first</Text>
              <Icon name="chevron" size={14} color={colors.volt} />
            </Pressable>
          ) : null}
          <View style={styles.picture}>
            {kit ? <LoadView weight={weight} kit={kit} perSide={focus.perSide} includesEquipment={focus.includesEquipment} /> : null}
          </View>
          <View style={styles.target}>
            {drop ? (
              <Stamp key={`drop-${drop.drops}`}>
                <Text style={styles.targetStamp}>{bottomedOut ? 'NOTHING LEFT TO DROP' : dropTo !== null ? `DROP TO ABOUT ${num(dropTo)} KG` : 'DROP THE WEIGHT'}</Text>
              </Stamp>
            ) : null}
            {bottomedOut ? <Muted style={styles.middle}>{voice.dropFloor(drop!.drops)}</Muted> : null}
            {wasDrop ? <Text style={styles.targetText}>DROP SET</Text> : null}
            {!drop && joke ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${num(weight!)} kilos is more than anyone has lifted. Fix it.`}
                onPress={() => {
                  feel.tap();
                  const smaller = round2(weight! / 10);
                  editValue(focus, set, 'weight', setMax(focus, smaller, reps) === null ? null : smaller);
                }}
                style={styles.targetTry}
              >
                <Icon name="target" size={16} color={colors.danger} />
                <Text style={[styles.targetText, styles.targetJoke]}>THAT’S A WORLD RECORD. TYPO?</Text>
              </Pressable>
            ) : null}
            {!drop && called ? (
              clears ? <Stamp key="cleared"><Text style={styles.targetStamp}>THAT BEATS THE CALL</Text></Stamp> : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Called by ${called.caller.displayName}. Load ${num(called.targetWeight!)} kilos plus one jump.`}
                  onPress={() => {
                    feel.warn();
                    const loaded = { ...focus, ...withSetValue(focus, set, 'weight', nudge(called.targetWeight!, jump), { onward: true }) };
                    workout.update(focus.id, called.targetReps === null ? loaded : { ...loaded, ...withSetValue(loaded, set, 'reps', called.targetReps, { onward: true, fold: true }) });
                  }}
                  style={styles.targetTry}
                >
                  <Icon name="target" size={16} color={colors.warn} />
                  <Text style={[styles.targetText, styles.targetCall]}>CALLED: BEAT {num(called.targetWeight!)} KG{called.targetReps ? ` × ${called.targetReps}` : ''}</Text>
                </Pressable>
              )
            ) : null}
            {!drop && !called && beating ? <Stamp key="best"><Text style={styles.targetStamp}>THAT’S A NEW BEST</Text></Stamp> : null}
            {!drop && !called && toBeat !== null ? (
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
            <View style={styles.flex}>
              <Stepper variant="compact" label="Weight" unit="kg" value={weight} step={jump} max={MAX_WEIGHT} onStepPress={() => { feel.tap(); setJumpName(focus.name); }} onChange={(value) => editValue(focus, set, 'weight', value)} />
            </View>
            <View style={styles.flex}>
              <Stepper variant="compact" label="Reps" value={reps} step={1} max={1000} decimals={false} onChange={(value) => editValue(focus, set, 'reps', value)} />
            </View>
          </View>
        </FadeIn>
      ),
      action: done ? (
        <>
          <Button title="Keep it" onPress={() => { feel.tap(); setViewSet(null); }} />
          <Button title="Undo this set" variant="ghost" onPress={() => undo(focus, set)} />
        </>
      ) : drop ? (
        <>
          <Button title={`Drop set ${set + 1} of ${ticks.length} done`} onPress={() => tick(focus, set, true)} style={styles.done} />
          <Row>
            <Button title="Drop again" variant="ghost" onPress={() => {
              if (bottomedOut) {
                feel.warn();
                toast(voice.dropFloor(Date.now()));
                return;
              }
              feel.tap();
              setDropping({ ...drop, drops: drop.drops + 1 });
            }} style={styles.flex} />
            <Button title="Not a drop set" variant="ghost" onPress={() => { feel.tap(); setDropping(null); }} style={styles.flex} />
          </Row>
        </>
      ) : (
        <>
          <Button title={`Set ${set + 1} of ${ticks.length} done`} onPress={() => tick(focus, set)} style={styles.done} />
          {canMarkDrops(ticks.length) && !joke ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { feel.tap(); setDropping({ id: focus.id, set, drops: 1 }); }} style={styles.link}>
              <Text style={styles.linkText}>Make it a drop set</Text>
            </Pressable>
          ) : null}
        </>
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

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Add a lift">
        <AddLift draft={draft} onAdd={add} />
      </Sheet>
      <LiftSheet
        entry={setupEntry}
        onChange={(changes) => setupEntry && workout.update(setupEntry.id, changes)}
        onRemove={() => {
          if (setupEntry) workout.remove(setupEntry.id);
          setSetupId(null);
          goTo(null);
        }}
        onClose={() => setSetupId(null)}
      />
      <WarmupSheet warmup={warmup} onClose={() => setWarmup(null)} />
      <JumpSheet name={jumpName} onClose={() => setJumpName(null)} />
      <WorkoutSheet
        visible={more}
        draft={draft}
        finishLabel={totals.done && focus ? (draft.editing ? 'Save changes' : `Finish now, ${totals.done} of ${totals.all} sets`) : null}
        onFinish={() => { setMore(false); workout.finish(); }}
        onRename={workout.rename}
        onRedate={workout.redate}
        onMove={workout.move}
        onListView={() => { setMore(false); setLogging('list'); }}
        onDiscard={() => { setMore(false); void workout.discard(); }}
        onClose={() => setMore(false)}
      />
      <Burst fire={fire} big={beatBest} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  host: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  action: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  headerTitle: { fontFamily: fonts.label, fontSize: 18, color: colors.ink },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  warmLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', minHeight: 44 },
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
  targetCall: { color: colors.warn },
  targetJoke: { color: colors.danger },
  race: { alignSelf: 'stretch', gap: space.xs, marginTop: space.sm },
  raceText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink3, textAlign: 'center' },
  done: { minHeight: 72 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  middle: { textAlign: 'center' },
  allDone: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.ink, textAlign: 'center' },
  upNext: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink, textAlign: 'center' },
  stamp: { alignSelf: 'center', paddingHorizontal: space.md, paddingVertical: space.xs, borderWidth: 3, borderColor: colors.volt, borderRadius: 6 },
  stampText: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, color: colors.volt },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt },
});
