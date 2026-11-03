import type { LoggedWorkout } from '@sandbag/shared';
import { StyleSheet, Text, View } from 'react-native';
import { formatDate } from '@/domain/format';
import { volumeOf } from '@/domain/history';
import { fonts, space } from '@/theme';
import { GrowUp } from './motion';

const HEIGHT = 150;
const SHOWN = 10;

/** Every recent session of this workout side by side, with this one picked out. */
export function SessionTrend({ sessions, workout, ink, faded, height = HEIGHT }: { sessions: LoggedWorkout[]; workout: LoggedWorkout; ink: string; faded: string; height?: number }) {
  const shown = sessions.slice(-SHOWN);
  const top = Math.max(1, ...shown.map(volumeOf));
  return (
    <View style={styles.host}>
      <View style={[styles.bars, { height }]}>
        {shown.map((session, place) => (
          <GrowUp
            key={session.id}
            height={Math.max(4, (volumeOf(session) / top) * height)}
            delay={place * 60}
            style={[styles.bar, { backgroundColor: session.id === workout.id ? ink : faded }]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: ink }]}>{formatDate(shown[0]?.date ?? workout.date).toUpperCase()}</Text>
        <Text style={[styles.label, { color: ink }]}>THIS ONE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { gap: space.xs },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  bar: { flex: 1, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1 },
});
