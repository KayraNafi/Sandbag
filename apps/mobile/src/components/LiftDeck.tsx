import { catalogEntry } from '@sandbag/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { num, signed } from '@/domain/format';
import type { LiftProgress } from '@/domain/progress';
import { colors, fonts, radius, space } from '@/theme';
import { EquipmentIcon } from './icons';
import { LoadView } from './LoadView';
import { CountUp, feel } from './motion';
import { Sparkline } from './Sparkline';
import { Muted } from './ui';

function LiftPage({ lift, width }: { lift: LiftProgress; width: number }) {
  const equipment = catalogEntry(lift.name)?.equipment;
  const up = lift.change > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${lift.name}, ${num(lift.latest)} ${lift.unit}, ${signed(lift.change)} since you started`}
      onPress={() => { feel.tap(); router.push(`/exercise/${encodeURIComponent(lift.key)}`); }}
      style={[styles.page, { width }]}
    >
      <View style={styles.head}>
        {equipment ? <EquipmentIcon type={equipment} size={24} color={colors.volt} /> : null}
        <Text numberOfLines={1} style={styles.name}>{lift.name}</Text>
      </View>
      <View style={styles.numbers}>
        <CountUp value={Math.round(lift.latest)} style={styles.weight} />
        <Text style={styles.unit}>{lift.unit.toUpperCase()}</Text>
        <View style={styles.flex} />
        <Text style={[styles.change, up && styles.changeUp]}>{signed(lift.change)}</Text>
      </View>
      {lift.unit === 'kg' ? <LoadView weight={lift.latest} equipment={equipment} /> : null}
      <Sparkline values={lift.points.map((point) => point.value)} width={Math.max(120, width - space.lg * 2)} height={52} />
      <Muted>Started at {num(lift.first)} {lift.unit}. {lift.points.length} sessions in.</Muted>
    </Pressable>
  );
}

/** One lift at a time. Swipe for the next, tap for the whole story. */
export function LiftDeck({ lifts }: { lifts: LiftProgress[] }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  return (
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={styles.deck}>
      {width ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / width);
            if (next !== page) {
              feel.tap();
              setPage(next);
            }
          }}
        >
          {lifts.map((lift) => <LiftPage key={lift.key} lift={lift} width={width} />)}
        </ScrollView>
      ) : null}
      {lifts.length > 1 ? (
        <View style={styles.dots} accessibilityLabel={`Lift ${page + 1} of ${lifts.length}`}>
          {lifts.map((lift, index) => <View key={lift.key} style={[styles.dot, index === page && styles.dotOn]} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  deck: { gap: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, paddingBottom: space.md, overflow: 'hidden' },
  page: { padding: space.lg, paddingBottom: 0, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  numbers: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  weight: { fontFamily: fonts.display, fontSize: 72, lineHeight: 76, color: colors.ink },
  unit: { fontFamily: fonts.label, fontSize: 17, letterSpacing: 1, color: colors.ink3, marginBottom: space.md },
  change: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.ink2, marginBottom: space.sm },
  changeUp: { color: colors.volt },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  dot: { width: 22, height: 6, backgroundColor: colors.surface2, transform: [{ skewX: '-18deg' }] },
  dotOn: { backgroundColor: colors.volt },
});
