import { addDays, mondayOf } from '@sandbag/shared';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, space } from '@/theme';
import { Pop } from './motion';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** This week at a glance: lit for a day trained, outlined for today. */
export function WeekStrip({ dates, today }: { dates: string[]; today: string }) {
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
              ? <Pop delay={120 + index * 50}><View style={[styles.mark, styles.lit]} /></Pop>
              : <View style={[styles.mark, date === today && styles.today]} />}
            <Text style={[styles.letter, date === today && styles.letterToday]}>{letter}</Text>
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
});
