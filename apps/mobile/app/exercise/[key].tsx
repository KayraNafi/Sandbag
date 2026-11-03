import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { catalogEntry } from '@sandbag/shared';
import { LineChart } from '@/components/LineChart';
import { LoadView } from '@/components/LoadView';
import { SessionRow } from '@/components/LiftRow';
import { CountUp } from '@/components/motion';
import { Card, Heading, Label, Muted, Screen, ShowMore, Title, useShowMore } from '@/components/ui';
import { useData } from '@/data/store';
import { agoText, num, signed, summary } from '@/domain/format';
import { activeLogged, buildHistory } from '@/domain/history';
import { changePercent, dailyPoints } from '@/domain/progress';
import { colors, fonts } from '@/theme';

export default function ExerciseScreen() {
  const { key = '' } = useLocalSearchParams<{ key: string }>();
  const logged = useData((state) => state.logged);
  const history = useMemo(() => buildHistory(activeLogged(logged)).get(decodeURIComponent(key)), [logged, key]);
  const sessions = useShowMore(history?.log.length ?? 0);
  if (!history) return <Screen padTop={false}><Muted>No sessions of this one yet.</Muted></Screen>;

  const timed = history.log.at(-1)?.kind === 'time';
  const points = dailyPoints(history);
  const first = points[0];
  const latest = points.at(-1);
  const best = points.length ? Math.max(...points.map((point) => point.value)) : null;
  const unit = timed ? 'min' : 'kg';

  return (
    <Screen padTop={false}>
      <Title>{history.name}</Title>
      {first && latest && best !== null ? (
        <View style={styles.numbers}>
          <CountUp value={Math.round(latest.value)} style={styles.big} />
          <Text style={styles.unit}>{unit.toUpperCase()}</Text>
          <View style={styles.flex} />
          <Text style={[styles.change, latest.value > first.value && styles.changeUp]}>{signed(changePercent(first.value, latest.value))}</Text>
        </View>
      ) : null}
      {latest && !timed ? <LoadView weight={latest.value} equipment={catalogEntry(history.name)?.equipment} /> : null}
      {first && best !== null ? <Muted>Started at {num(first.value)} {unit}. Best ever {num(best)} {unit}.</Muted> : null}
      <Card>
        <Label>{timed ? 'Minutes per session' : 'Weight per session, kg'}</Label>
        {points.length ? <LineChart points={points} unit={unit} /> : <Muted>No numbers logged yet, so nothing to chart.</Muted>}
      </Card>
      <Heading section>Every session</Heading>
      {[...history.log].reverse().slice(0, sessions.shown).map((item, index) => (
        <SessionRow
          key={`${item.workoutId}-${item.id}`}
          date={item.date}
          title={summary(item)}
          detail={item.note || agoText(item.date)}
          delay={Math.min(index, 8) * 40}
          onPress={() => router.push(`/workout/logged/${item.workoutId}`)}
        />
      ))}
      <ShowMore left={sessions.left} page={sessions.page} onPress={sessions.more} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  numbers: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  big: { fontFamily: fonts.display, fontSize: 96, lineHeight: 100, color: colors.ink },
  unit: { fontFamily: fonts.label, fontSize: 17, letterSpacing: 1, color: colors.ink3, marginBottom: 18 },
  change: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.ink2, marginBottom: 12 },
  changeUp: { color: colors.volt },
});
