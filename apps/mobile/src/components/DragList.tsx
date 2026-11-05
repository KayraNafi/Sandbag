import { useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { feel } from '@/components/motion';
import { colors, space } from '@/theme';

/** A row's height until it has been measured. */
const ROW_GUESS = 64;

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
        const height = heights.current[index] ?? ROW_GUESS;
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
    <View style={styles.list}>
      {items.map((item, index) => (
        <Animated.View
          key={keyOf(item)}
          onLayout={(event) => {
            heights.current[index] = event.nativeEvent.layout.height + space.sm;
          }}
          style={[styles.row, dragging === index && { transform: [{ translateY: y }], zIndex: 2, opacity: 0.9 }]}
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
  list: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  grip: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
