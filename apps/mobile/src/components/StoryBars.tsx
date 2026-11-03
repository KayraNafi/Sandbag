import { Animated, StyleSheet, View } from 'react-native';

/** One bar a moment. The current one fills by itself and moves the story on when it's full. */
export function StoryBars({ total, at, progress, ink, track }: { total: number; at: number; progress: Animated.Value; ink: string; track: string }) {
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.bars} accessibilityLabel={`${at + 1} of ${total}`}>
      {Array.from({ length: total }, (_, place) => (
        <View key={place} style={[styles.bar, { backgroundColor: track }]}>
          {place < at ? <View style={[styles.barFull, { backgroundColor: ink }]} /> : null}
          {place === at ? <Animated.View style={[styles.barNow, { width, backgroundColor: ink }]} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  barFull: { flex: 1 },
  barNow: { height: 4 },
});
