import { addDays, mondayOf } from '@sandbag/shared';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, space } from '@/theme';
import { Pop } from './motion';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** This week at a glance: lit for a day trained, outlined for today. `onVolt` draws it in ink, for a volt card. */
export function WeekStrip({ dates, today, onVolt = false }: { dates: string[]; today: string; onVolt?: boolean }) {
  const monday = mondayOf(today);
  const trained = new Set(dates);
  const count = DAYS.filter((_, index) => trained.has(addDays(monday, index))).length;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${count} ${count === 1 ? 'day' : 'days'} trained this week`}>
      {DAYS.map((letter, index) => {
        const date = addDays(monday, index);
        return (
          <View key={date} style={styles.day}>
            {trained.has(date)
              ? <Pop delay={120 + index * 50}><View style={[styles.mark, onVolt ? styles.litOnVolt : styles.lit]} /></Pop>
              : <View style={[styles.mark, onVolt && styles.markOnVolt, date === today && (onVolt ? styles.todayOnVolt : styles.today)]} />}
            <Text style={[styles.letter, date === today && styles.letterToday, onVolt && styles.letterOnVolt]}>{letter}</Text>
          </View>
        );
      })}
    </View>
  );
}

const WEEKS = 8;

/** The last two months, a row a week, with each week's count. A gap is harder to ignore as a picture. */
export function WeekGrid({ dates, today }: { dates: string[]; today: string }) {
  const thisMonday = mondayOf(today);
  const trained = new Set(dates);
  return (
    <View style={styles.grid}>
      <View style={styles.gridRow}>
        <View style={styles.gridLabel} />
        {DAYS.map((letter, index) => <Text key={index} style={styles.gridHead}>{letter}</Text>)}
        <View style={styles.gridCount} />
      </View>
      {Array.from({ length: WEEKS }, (_, row) => {
        const monday = addDays(thisMonday, -7 * (WEEKS - 1 - row));
        const days = DAYS.map((_, day) => addDays(monday, day));
        const count = days.filter((date) => trained.has(date)).length;
        return (
          <View key={monday} style={styles.gridRow} accessible accessibilityLabel={`Week of ${monday}: ${count} ${count === 1 ? 'day' : 'days'}`}>
            <Text style={styles.gridLabel}>{row === WEEKS - 1 ? 'NOW' : ''}</Text>
            {days.map((date, day) => (
              <View key={date} style={styles.gridCell}>
                {trained.has(date)
                  ? <Pop delay={row * 35 + day * 10}><View style={[styles.gridDot, styles.lit]} /></Pop>
                  : <View style={[styles.gridDot, date > today && styles.future]} />}
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
  row: { flexDirection: 'row' },
  day: { flex: 1, alignItems: 'center', gap: space.xs },
  mark: { width: 30, height: 12, backgroundColor: colors.surface2, transform: [{ skewX: '-18deg' }] },
  lit: { backgroundColor: colors.volt },
  today: { borderWidth: 1, borderColor: colors.volt },
  letter: { fontFamily: fonts.label, fontSize: 12, color: colors.ink3 },
  letterToday: { color: colors.ink },
  litOnVolt: { backgroundColor: colors.voltInk },
  markOnVolt: { backgroundColor: 'rgba(13, 16, 2, 0.14)' },
  todayOnVolt: { borderWidth: 1, borderColor: colors.voltInk },
  letterOnVolt: { color: colors.voltInk },
  grid: { gap: 4 },
  gridRow: { flexDirection: 'row', alignItems: 'center' },
  gridLabel: { width: 34, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.volt },
  gridHead: { flex: 1, textAlign: 'center', fontFamily: fonts.label, fontSize: 12, color: colors.ink3 },
  gridCell: { flex: 1, height: 26, alignItems: 'center', justifyContent: 'center' },
  gridDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2 },
  future: { opacity: 0.35 },
  gridCount: { width: 24, textAlign: 'right', fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  gridEmpty: { color: colors.ink3 },
});
