import { useRef } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { feel } from '@/components/motion';
import { colors, fonts, space } from '@/theme';

/** Effort in words rather than a number to look up. It's stored as RPE, so the list layout shows the same value. */
const EFFORTS = [
  { rpe: 6, name: 'Easy', detail: 'Could do four more', color: colors.effortEasy },
  { rpe: 7, name: 'Moderate', detail: 'Three left in the tank', color: colors.chart },
  { rpe: 8, name: 'Hard', detail: 'Two left in the tank', color: colors.warn },
  { rpe: 9, name: 'Very hard', detail: 'One left, maybe', color: colors.danger },
  { rpe: 10, name: 'Max', detail: 'Nothing left at all', color: colors.effortMax },
] as const;

/** Slide or tap to where it landed. An RPE typed in the list layout shows as the nearest word. */
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
  const active = value ? EFFORTS.reduce((near, item) => (Math.abs(item.rpe - value) < Math.abs(near.rpe - value) ? item : near)) : null;
  const position = active ? EFFORTS.indexOf(active) : -1;
  return (
    <View style={styles.effort}>
      <View style={styles.text}>
        <Text style={styles.name}>{active ? active.name.toUpperCase() : 'HOW HARD WAS IT?'}</Text>
        <Text style={styles.detail}>{active ? active.detail : 'Slide to where it landed'}</Text>
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

const styles = StyleSheet.create({
  effort: { gap: space.sm },
  text: { gap: 2 },
  name: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.ink },
  detail: { fontFamily: fonts.body, fontSize: 15, color: colors.ink2 },
  track: { flexDirection: 'row', gap: 3, height: 44, alignItems: 'center' },
  stop: { flex: 1, height: 16, transform: [{ skewX: '-18deg' }] },
});
