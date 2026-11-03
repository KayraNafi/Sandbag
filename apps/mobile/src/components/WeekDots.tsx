import { addDays, mondayOf } from '@sandbag/shared';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, space } from '@/theme';
import { Pop } from './motion';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** This week at a glance: lit for a day trained, ringed for today. */
export function WeekDots({ trained, today, onVolt = false }: { trained: string[]; today: string; onVolt?: boolean }) {
  const monday = mondayOf(today);
  const done = new Set(trained);
  return (
    <View style={styles.row} accessibilityLabel={`${trained.filter((date) => date >= monday && date <= addDays(monday, 6)).length} days trained this week`}>
      {DAYS.map((letter, index) => {
        const date = addDays(monday, index);
        const lit = done.has(date);
        return (
          <View key={date} style={styles.day}>
            {lit
              ? <Pop delay={120 + index * 50}><View style={[styles.dot, onVolt ? styles.dotLitOnVolt : styles.dotLit]} /></Pop>
              : <View style={[styles.dot, onVolt && styles.dotOnVolt, date === today && (onVolt ? styles.dotTodayOnVolt : styles.dotToday)]} />}
            <Text style={[styles.letter, date === today && styles.letterToday, onVolt && styles.letterOnVolt]}>{letter}</Text>
          </View>
        );
      })}
    </View>
  );
}

const WEEKS = 8;
const CELL = 26;

/** The last two months, one row per week. Gaps are harder to ignore as a picture than as a number. */
export function WeekGrid({ trained, today }: { trained: string[]; today: string }) {
  const thisMonday = mondayOf(today);
  const done = new Set(trained);
  return (
    <View style={styles.grid} accessibilityLabel={`${[...done].filter((date) => date >= addDays(thisMonday, -7 * (WEEKS - 1))).length} days trained in the last ${WEEKS} weeks`}>
      <View style={styles.gridRow}>
        <View style={styles.gridLabel} />
        {DAYS.map((letter, index) => <Text key={index} style={styles.gridHead}>{letter}</Text>)}
        <View style={styles.gridCount} />
      </View>
      {Array.from({ length: WEEKS }, (_, row) => {
        const monday = addDays(thisMonday, -7 * (WEEKS - 1 - row));
        const days = Array.from({ length: 7 }, (__, day) => addDays(monday, day));
        const count = days.filter((date) => done.has(date)).length;
        return (
          <View key={monday} style={styles.gridRow}>
            <Text style={styles.gridLabel}>{row === WEEKS - 1 ? 'NOW' : ''}</Text>
            {days.map((date, day) => (
              <View key={date} style={styles.gridCell}>
                {done.has(date)
                  ? <Pop delay={row * 35 + day * 10}><View style={[styles.gridDot, styles.gridDotLit]} /></Pop>
                  : <View style={[styles.gridDot, date > today && styles.gridDotFuture]} />}
              </View>
            ))}
            <Text style={[styles.gridCount, count === 0 && styles.gridEmpty]}>{count}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: space.xs, flex: 1 },
  dot: { width: 30, height: 12, backgroundColor: colors.surface2, transform: [{ skewX: '-18deg' }] },
  dotLit: { backgroundColor: colors.volt },
  dotToday: { borderWidth: 1, borderColor: colors.volt },
  dotLitOnVolt: { backgroundColor: colors.voltInk },
  dotOnVolt: { backgroundColor: 'rgba(13, 16, 2, 0.14)' },
  dotTodayOnVolt: { borderWidth: 1, borderColor: colors.voltInk },
  letterOnVolt: { color: colors.voltInk },
  letter: { fontFamily: fonts.label, fontSize: 12, color: colors.ink3 },
  letterToday: { color: colors.ink },
  grid: { gap: 4 },
  gridRow: { flexDirection: 'row', alignItems: 'center' },
  gridLabel: { width: 34, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.volt },
  gridHead: { flex: 1, textAlign: 'center', fontFamily: fonts.label, fontSize: 12, color: colors.ink3 },
  gridCell: { flex: 1, height: CELL, alignItems: 'center', justifyContent: 'center' },
  gridDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2 },
  gridDotLit: { backgroundColor: colors.volt },
  gridDotFuture: { opacity: 0.35 },
  gridCount: { width: 24, textAlign: 'right', fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  gridEmpty: { color: colors.ink3 },
});
