import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { voice } from '@sandbag/shared';
import { isOverMax, nudge, num, parseNumber } from '@/domain/format';
import { colors, fonts, radius, space } from '@/theme';
import { Icon } from './icons';
import { feel, usePulse } from './motion';
import { toast } from './Toast';

const REPEAT_MS = 130;

/** Big − and + either side of a number. Hold one and it keeps going. Tap the number to type one instead. */
export function Stepper({ label, value, step, max, unit, decimals = true, compact = false, onStepPress, startAt, onChange }: {
  label: string;
  value: number | null;
  step: number;
  max: number;
  unit?: string;
  decimals?: boolean;
  /** Half a screen wide: the number on top, its name under it, and the buttons side by side below. */
  compact?: boolean;
  /** Offers to change what the buttons move by, for a gym that can't do the usual step. */
  onStepPress?: () => void;
  /** Where the first tap of + lands when there's no number yet. */
  startAt?: number;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : num(value));
  const kick = usePulse(value);
  useEffect(() => {
    if (parseNumber(text, max) !== value) setText(value === null ? '' : num(value));
    // Only outside changes (like the buttons) should rewrite what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // Read fresh on every repeat, since holding a button keeps firing long after this render.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRepeat = () => {
    if (repeat.current) clearInterval(repeat.current);
    repeat.current = null;
  };
  useEffect(() => stopRepeat, []);
  const move = (delta: number) => {
    feel.tap();
    // The first tap on an empty barbell goes straight to the bar, not 2.5 kg of nothing.
    const next = latest.current.value === null && startAt && delta > 0 ? startAt : nudge(latest.current.value ?? 0, delta);
    if (next > max) {
      stopRepeat();
      toast(voice.overLimit(unit ? `${max} ${unit}` : String(max)));
    }
    latest.current.onChange(Math.min(next, max));
  };
  const button = (delta: number, sign: string, label_: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label_} ${label} by ${step}`} onPress={() => move(delta)} onLongPress={() => { stopRepeat(); repeat.current = setInterval(() => move(delta), REPEAT_MS); }} onPressOut={stopRepeat} style={({ pressed }) => [compact ? styles.stepButtonCompact : styles.stepButton, pressed && styles.pressed]}>
      <Text style={styles.stepSign}>{sign}</Text>
    </Pressable>
  );
  const number = (
    <TextInput
      accessibilityLabel={label}
      keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
      placeholder="–"
      placeholderTextColor={colors.ink3}
      selectTextOnFocus
      value={text}
      onChangeText={(next) => {
        if (isOverMax(next, max)) {
          setText(String(max));
          onChange(max);
          toast(voice.overLimit(unit ? `${max} ${unit}` : String(max)));
          return;
        }
        setText(next);
        onChange(parseNumber(next, max));
      }}
      style={[styles.stepInput, compact && styles.stepInputCompact]}
    />
  );
  if (compact) {
    return (
      <View style={styles.stepper}>
        <Animated.View style={[styles.stepValue, { transform: [{ scale: kick }] }]}>
          {number}
          {onStepPress ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Change the ${label.toLowerCase()} jump, now ${num(step)}`} hitSlop={8} onPress={onStepPress} style={styles.stepJump}>
              <Text style={styles.stepUnit}>{(unit ?? label).toUpperCase()}</Text>
              <Text style={styles.stepJumpText}>JUMPS OF {num(step)}</Text>
              <Icon name="chevron" size={12} color={colors.volt} />
            </Pressable>
          ) : <View style={styles.stepJump}><Text style={styles.stepUnit}>{(unit ?? label).toUpperCase()}</Text></View>}
        </Animated.View>
        <View style={styles.stepRow}>
          {button(-step, '−', 'Lower')}
          {button(step, '+', 'Raise')}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label.toUpperCase()}</Text>
      <View style={styles.stepRow}>
        {button(-step, '−', 'Lower')}
        <Animated.View style={[styles.stepValue, { transform: [{ scale: kick }] }]}>
          {number}
          {unit ? <Text style={styles.stepUnit}>{unit}</Text> : null}
        </Animated.View>
        {button(step, '+', 'Raise')}
      </View>
    </View>
  );
}

const HOLD_MS = 900;
const QUICK_TAP = 0.2;

/** Press and hold to finish: a little ceremony, and no finishing by accident. Screen readers can just activate it. */
export function HoldButton({ title, onDone }: { title: string; onDone: () => void }) {
  const fill = useRef(new Animated.Value(0)).current;
  const finish = useRef(onDone);
  finish.current = onDone;
  const start = () => {
    feel.tap();
    Animated.timing(fill, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) finish.current();
    });
  };
  const stop = () => {
    fill.stopAnimation((value) => {
      if (value >= 1) return;
      if (value < QUICK_TAP) toast('Hold it down. You’ve earned a second.');
      Animated.timing(fill, { toValue: 0, duration: 180, useNativeDriver: false }).start();
    });
  };
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => finish.current()}
      onPressIn={start}
      onPressOut={stop}
      style={styles.hold}
    >
      <Animated.View style={[styles.holdFill, { width }]} />
      <Text style={styles.holdText}>{title.toUpperCase()}</Text>
    </Pressable>
  );
}

const EFFORTS: { rpe: number; name: string; detail: string; color: string }[] = [
  { rpe: 6, name: 'Easy', detail: 'Could do four more', color: '#7fd1c0' },
  { rpe: 7, name: 'Moderate', detail: 'Three left in the tank', color: '#b9e628' },
  { rpe: 8, name: 'Hard', detail: 'Two left in the tank', color: '#f1d75e' },
  { rpe: 9, name: 'Very hard', detail: 'One left, maybe', color: '#ff8a70' },
  { rpe: 10, name: 'Max', detail: 'Nothing left at all', color: '#ff5f4d' },
];

export const effortName = (rpe: number | null | undefined) => (rpe ? EFFORTS.reduce((near, item) => (Math.abs(item.rpe - rpe) < Math.abs(near.rpe - rpe) ? item : near)).name : null);

/** Effort in words rather than a number to look up. It's stored as RPE. */
export function EffortSlider({ value, onChange }: { value: number | null; onChange: (rpe: number) => void }) {
  const width = useRef(1);
  const start = useRef(0);
  const last = useRef(value);
  const report = useRef(onChange);
  report.current = onChange;
  const pick = (x: number) => {
    const index = Math.max(0, Math.min(EFFORTS.length - 1, Math.floor((x / width.current) * EFFORTS.length)));
    const { rpe } = EFFORTS[index]!;
    if (last.current !== rpe) {
      last.current = rpe;
      feel.tap();
      report.current(rpe);
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
  const active = EFFORTS.find((item) => item.rpe === value) ?? (value ? EFFORTS.reduce((near, item) => (Math.abs(item.rpe - value) < Math.abs(near.rpe - value) ? item : near)) : null);
  const position = active ? EFFORTS.indexOf(active) : -1;
  return (
    <View style={styles.effort}>
      <View style={styles.effortText}>
        <Text style={styles.effortName}>{active ? active.name.toUpperCase() : 'HOW HARD WAS IT?'}</Text>
        <Text style={styles.effortDetail}>{active ? active.detail : 'Slide to where it landed'}</Text>
      </View>
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Effort"
        accessibilityValue={{ text: active?.name ?? 'Not set' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          const next = EFFORTS[Math.max(0, Math.min(EFFORTS.length - 1, position + (nativeEvent.actionName === 'increment' ? 1 : -1)))];
          if (next) onChange(next.rpe);
        }}
        onLayout={(event: LayoutChangeEvent) => {
          width.current = event.nativeEvent.layout.width || 1;
        }}
        style={styles.track}
      >
        {EFFORTS.map((item, index) => (
          <View key={item.rpe} pointerEvents="none" style={[styles.stop, { backgroundColor: index <= position ? item.color : colors.surface2 }]} />
        ))}
      </View>
    </View>
  );
}

/** Drag by the handle to reorder. Screen readers get move up and move down. */
export function DragList<T>({ items, keyOf, label, renderItem, onMove }: {
  items: T[];
  keyOf: (item: T) => string;
  label: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onMove: (from: number, to: number) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const heights = useRef<number[]>([]);
  const y = useRef(new Animated.Value(0)).current;
  const move = useRef(onMove);
  move.current = onMove;
  const count = useRef(items.length);
  count.current = items.length;

  // Kept across renders: a new responder mid-drag would lose track of the finger.
  const handles = useRef(new Map<number, ReturnType<typeof PanResponder.create>>());
  const handle = (index: number) => {
    const existing = handles.current.get(index);
    if (existing) return existing;
    const created = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      feel.tap();
      setDragging(index);
      y.setValue(0);
    },
    onPanResponderMove: (_, gesture) => y.setValue(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      const height = heights.current[index] ?? 64;
      const target = Math.max(0, Math.min(count.current - 1, index + Math.round(gesture.dy / height)));
      setDragging(null);
      y.setValue(0);
      if (target !== index) {
        feel.tick();
        move.current(index, target);
      }
    },
    onPanResponderTerminate: () => {
      setDragging(null);
      y.setValue(0);
    },
    });
    handles.current.set(index, created);
    return created;
  };

  return (
    <View style={styles.dragList}>
      {items.map((item, index) => (
        <Animated.View
          key={keyOf(item)}
          onLayout={(event) => {
            heights.current[index] = event.nativeEvent.layout.height + space.sm;
          }}
          style={[styles.dragRow, dragging === index && { transform: [{ translateY: y }], zIndex: 2, opacity: 0.9 }]}
        >
          <View style={styles.flex}>{renderItem(item, index)}</View>
          <View
            {...handle(index).panHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Reorder ${label(item)}`}
            accessibilityActions={[{ name: 'increment', label: 'Move down' }, { name: 'decrement', label: 'Move up' }]}
            onAccessibilityAction={({ nativeEvent }) => {
              const to = index + (nativeEvent.actionName === 'increment' ? 1 : -1);
              if (to >= 0 && to < items.length) onMove(index, to);
            }}
            style={styles.grip}
          >
            <Icon name="grip" size={22} color={colors.ink3} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hold: { minHeight: 72, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.volt, overflow: 'hidden' },
  holdFill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.chart },
  holdText: { fontFamily: fonts.display, fontSize: 20, color: colors.voltInk },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  stepper: { gap: space.sm },
  stepLabel: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink3, textAlign: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepButton: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepButtonCompact: { flex: 1, height: 64, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepJump: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: 44 },
  stepJumpText: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.volt },
  stepSign: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.volt },
  stepValue: { flex: 1, alignItems: 'center' },
  stepInput: { width: '100%', fontFamily: fonts.display, fontSize: 56, lineHeight: 64, color: colors.ink, textAlign: 'center', padding: 0 },
  stepInputCompact: { fontSize: 72, lineHeight: 74 },
  stepUnit: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.ink3 },
  effort: { gap: space.sm },
  effortText: { gap: 2 },
  effortName: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.ink },
  effortDetail: { fontFamily: fonts.body, fontSize: 15, color: colors.ink2 },
  track: { flexDirection: 'row', gap: 3, height: 44, alignItems: 'center' },
  stop: { flex: 1, height: 16, transform: [{ skewX: '-18deg' }] },
  dragList: { gap: space.sm },
  dragRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  grip: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
