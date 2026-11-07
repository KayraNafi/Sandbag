import { MAX_VARIED_SETS, supersetGroups } from '@sandbag/shared';
import { forwardRef, useEffect, useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Icon } from '@/components/icons';
import { feel, GrowBar, Pop, prefersLessMotion, usePulse } from '@/components/motion';
import { clock } from '@/domain/format';
import type { DraftEntry } from '@/domain/history';
import { isFinished, tickedCount, ticksOf } from '@/domain/sets';
import { colors, fonts, space } from '@/theme';

/** Past this many lifts the row scrolls, at a fixed width each. */
const TRACK_FITS = 3;
const TRACK_ITEM = 112;
const RING = 220;
const RING_LINE = 12;
/** The last seconds of a rest tick, so it can be felt without looking. */
const FINAL_SECONDS = 3;

/** Animated marks what it wraps `collapsable`, a native-only prop the web would write onto the <circle>. */
const PlainCircle = forwardRef<ComponentRef<typeof Circle>, ComponentProps<typeof Circle> & { collapsable?: boolean }>(
  ({ collapsable: _collapsable, ...props }, ref) => <Circle ref={ref} {...props} />,
);
const AnimatedCircle = Animated.createAnimatedComponent(PlainCircle);

/** How much of a lift is done, from 0 to 1. */
const shareDone = (entry: DraftEntry) => (entry.kind === 'time' ? Number(entry.done) : tickedCount(entry) / ticksOf(entry).length);

/** Counts from the moment, not by ticks, so a backgrounded app can't put it wrong. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

/** Whole seconds left until `end`, or 0 when there's nothing running. */
export function useSecondsTo(end: number | null): number {
  const now = useNow(end !== null);
  return end === null ? 0 : Math.ceil((end - now) / 1000);
}

export function SessionClock({ startedAt }: { startedAt: number }) {
  const now = useNow(true);
  return <Text style={styles.clock}>{clock(Math.max(0, Math.floor((now - startedAt) / 1000)))}</Text>;
}

/** The whole workout on one line: each lift is its name over its own progress. Tap one to go there. */
export function LiftTrack({ entries, focusId, onPick, onAdd }: { entries: DraftEntry[]; focusId: string | null; onPick: (id: string) => void; onAdd: () => void }) {
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const crowded = entries.length > TRACK_FITS;
  const at = entries.findIndex((entry) => entry.id === focusId);
  useEffect(() => {
    if (crowded && at >= 0) scroller.current?.scrollTo({ x: Math.max(0, at - 1) * (TRACK_ITEM + space.sm), animated: !prefersLessMotion() });
  }, [at, crowded]);
  const lift = (entry: DraftEntry) => {
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
  };
  // A superset's lifts sit together on one line, since they're done as one.
  const lifts = supersetGroups(entries).map((group) => (group.length < 2 ? lift(group[0]!) : (
    <View key={group[0]!.id} accessibilityLabel={`Superset of ${group.length}`} style={[styles.trackPair, !crowded && { flex: group.length }]}>
      {group.map(lift)}
    </View>
  )));
  const addLift = (
    // An empty slot shaped like the others, the way Invite sits at the end of the crew row.
    <Pressable accessibilityRole="button" accessibilityLabel="Add a lift" onPress={onAdd} style={[styles.trackItem, styles.trackAdd]}>
      <View style={styles.trackSlot} />
      <Text numberOfLines={1} style={[styles.trackName, styles.trackAddText]}>+ Add</Text>
    </Pressable>
  );
  if (!crowded) return <View style={styles.track}>{lifts}{addLift}</View>;
  return (
    <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track} style={styles.trackScroll}>
      {lifts}{addLift}
    </ScrollView>
  );
}

/** One mark per set. Tap one to go back and change it, or + to add another. */
export function SetPips({ ticks, at, onPick, onAdd }: { ticks: boolean[]; at: number; onPick: (set: number) => void; onAdd: () => void }) {
  return (
    <View style={styles.pips}>
      {ticks.map((done, set) => (
        <Pop key={`${set}-${done}`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set ${set + 1}${done ? ', done' : ''}`}
            accessibilityState={{ selected: set === at }}
            onPress={() => onPick(set)}
            style={[styles.pip, done && styles.pipDone, set === at && styles.pipOn]}
          >
            <Text style={[styles.pipText, done && styles.pipTextDone]}>{set + 1}</Text>
          </Pressable>
        </Pop>
      ))}
      {ticks.length < MAX_VARIED_SETS ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add set" onPress={onAdd} style={styles.pipAdd}>
          <Icon name="plus" size={18} color={colors.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The rest counting down as a ring that empties, with a tap felt for each of the last seconds. */
export function RestRing({ seconds, total }: { seconds: number; total: number }) {
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  clock: { fontFamily: fonts.display, fontSize: 20, color: colors.ink2, fontVariant: ['tabular-nums'] },
  track: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  trackScroll: { flexGrow: 0 },
  trackPair: { flexDirection: 'row', gap: space.sm, paddingBottom: space.xs, borderBottomWidth: 2, borderColor: colors.volt },
  trackItem: { gap: space.xs, minHeight: 44, paddingTop: space.xs },
  trackItemFixed: { width: TRACK_ITEM },
  trackName: { fontFamily: fonts.label, fontSize: 15, color: colors.ink3 },
  trackNameOn: { color: colors.ink },
  trackAdd: { width: 64 },
  trackSlot: { height: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, transform: [{ skewX: '-18deg' }] },
  trackAddText: { color: colors.volt },
  pips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  pip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.surface2 },
  pipDone: { backgroundColor: colors.volt, borderColor: colors.volt },
  pipOn: { borderColor: colors.volt },
  pipText: { fontFamily: fonts.display, fontSize: 17, color: colors.ink2 },
  pipTextDone: { color: colors.voltInk },
  pipAdd: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringArt: { position: 'absolute', top: 0, left: 0 },
  ringTime: { fontFamily: fonts.display, fontSize: 56, lineHeight: 70, color: colors.volt, fontVariant: ['tabular-nums'] },
  ringLabel: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.ink3 },
});
