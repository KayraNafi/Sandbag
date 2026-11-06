import { kmText, voice } from '@sandbag/shared';
import { router } from 'expo-router';
import { Fragment, useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CountUp, FadeIn, feel } from '@/components/motion';
import { Button, Empty, Label, Muted, Screen, ShowMore, Title, useShowMore } from '@/components/ui';
import { useData } from '@/data/store';
import { formatDate, formatMonth, plural } from '@/domain/format';
import { activeLogged, volumeOf } from '@/domain/history';
import { activeRuns, runSummary, runTitle, timeline } from '@/domain/runs';
import { colors, fonts, radius, space } from '@/theme';

const BIG = 72;
/** How wide a display-font digit is, against its size. */
const DIGIT_WIDTH = 0.56;
const SIDES = 32;

/** One session: the date big enough to find, then what it was and what it moved. */
function SessionRow({ date, title, detail, delay, onPress }: { date: string; title: string; detail: string; delay: number; onPress: () => void }) {
  const [day, month] = formatDate(date).split(' ');
  return (
    <FadeIn delay={delay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${formatDate(date)}, ${detail}`}
        onPress={() => {
          feel.tap();
          onPress();
        }}
        style={({ pressed }) => [styles.session, pressed && styles.pressed]}
      >
        <View style={styles.date}>
          <Text style={styles.day}>{day}</Text>
          <Text style={styles.monthShort}>{month?.toUpperCase()}</Text>
        </View>
        <View style={styles.flex}>
          <Text numberOfLines={1} style={styles.title}>{title.toUpperCase()}</Text>
          <Text numberOfLines={1} style={styles.detail}>{detail}</Text>
        </View>
      </Pressable>
    </FadeIn>
  );
}

export default function History() {
  const logged = useData((state) => state.logged);
  const allRuns = useData((state) => state.runs);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  const runs = useMemo(() => activeRuns(allRuns), [allRuns]);
  const items = useMemo(() => timeline(workouts, runs), [workouts, runs]);
  const total = useMemo(() => workouts.reduce((sum, workout) => sum + volumeOf(workout), 0), [workouts]);
  const distance = useMemo(() => runs.reduce((sum, run) => sum + run.distanceKm, 0), [runs]);
  const { shown, left, more, page } = useShowMore(items.length);
  const { width } = useWindowDimensions();
  // The total shrinks to fit the screen, however many digits it grows to.
  const size = Math.min(BIG, Math.floor((width - SIDES) / (total.toLocaleString('en-US').length * DIGIT_WIDTH)));

  return (
    <Screen padTop={false}>
      <Title>History</Title>
      {items.length ? (
        <View style={styles.hero}>
          {total > 0 ? (
            <>
              <CountUp value={total} style={[styles.total, { fontSize: size, lineHeight: Math.round(size * 1.08) }]} />
              <Text style={styles.unit}>KG MOVED, ALL OF IT</Text>
              <Text style={styles.line}>{voice.lifted(total)}</Text>
            </>
          ) : null}
          <Muted>{plural(workouts.length, 'session')}{runs.length ? ` and ${kmText(distance)} on foot` : ''} on the record.</Muted>
        </View>
      ) : (
        <>
          <Empty title="Nothing yet" body="An empty history. Very mysterious. Very convenient." />
          <Button title="Go lift something" onPress={() => router.navigate('/')} />
        </>
      )}
      {items.slice(0, shown).map((item, index, list) => {
        const { date } = item;
        const previous = list[index - 1];
        // Newest first, so a heading goes wherever the month changes.
        const month = formatMonth(date);
        const newMonth = !previous || formatMonth(previous.date) !== month;
        const delay = Math.min(index, 8) * 40;
        if (item.kind === 'run') {
          return (
            <Fragment key={`run-${item.run.id}`}>
              {newMonth ? <Label style={styles.month}>{month}</Label> : null}
              <SessionRow date={date} title={runTitle(item.run)} detail={runSummary(item.run)} delay={delay} onPress={() => router.push(`/run/${item.run.id}`)} />
            </Fragment>
          );
        }
        const { workout } = item;
        const moved = volumeOf(workout);
        return (
          <Fragment key={workout.id}>
            {newMonth ? <Label style={styles.month}>{month}</Label> : null}
            <SessionRow
              date={date}
              title={workout.title}
              detail={`${plural(workout.entries.length, 'lift')}${moved ? ` · ${moved.toLocaleString('en-US')} kg` : ''}`}
              delay={delay}
              onPress={() => router.push(`/workout/logged/${workout.id}`)}
            />
          </Fragment>
        );
      })}
      <ShowMore left={left} page={page} onPress={more} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  hero: { gap: 2, marginBottom: space.sm },
  total: { fontFamily: fonts.display, color: colors.volt },
  unit: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.ink3 },
  line: { fontFamily: fonts.bodyStrong, fontSize: 17, lineHeight: 23, color: colors.ink, marginTop: space.sm },
  month: { marginTop: space.md },
  session: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 72, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface },
  pressed: { opacity: 0.75 },
  date: { width: 52, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surface2 },
  day: { fontFamily: fonts.display, fontSize: 28, lineHeight: 28, color: colors.volt },
  monthShort: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.ink3 },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.ink },
  detail: { fontFamily: fonts.body, fontSize: 15, lineHeight: 19, color: colors.ink3 },
});
