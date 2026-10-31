import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LineChart } from '@/components/LineChart';
import { Card, Heading, Label, Muted, Row, Screen, Title } from '@/components/ui';
import { useData } from '@/data/store';
import { formatDate, num, signed, summary } from '@/domain/format';
import { activeLogged, buildHistory } from '@/domain/history';
import { changePercent, dailyPoints } from '@/domain/progress';
import { colors, fonts } from '@/theme';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Label>{label}</Label>
    </View>
  );
}

export default function ExerciseScreen() {
  const { key = '' } = useLocalSearchParams<{ key: string }>();
  const logged = useData((state) => state.logged);
  const history = useMemo(() => buildHistory(activeLogged(logged)).get(decodeURIComponent(key)), [logged, key]);
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
        <Row style={styles.stats}>
          <Stat label="Start" value={num(first.value)} />
          <Stat label="Now" value={num(latest.value)} />
          <Stat label="Best" value={num(best)} />
          <Stat label="Change" value={signed(changePercent(first.value, latest.value))} />
        </Row>
      ) : null}
      <Card>
        <Label>{timed ? 'Minutes per session' : 'Weight per session, kg'}</Label>
        {points.length ? <LineChart points={points} unit={unit} /> : <Muted>No numbers logged yet, so nothing to chart.</Muted>}
      </Card>
      <Heading>Log</Heading>
      {[...history.log].reverse().map((item) => (
        <Card key={`${item.workoutId}-${item.id}`} label={`Session on ${formatDate(item.date)}`} onPress={() => router.push(`/workout/logged/${item.workoutId}`)}>
          <Text style={styles.date}>{formatDate(item.date)}</Text>
          <Muted>{summary(item)}</Muted>
          {item.note ? <Muted>{item.note}</Muted> : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { alignItems: 'stretch' },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14 },
  statValue: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  date: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
});
