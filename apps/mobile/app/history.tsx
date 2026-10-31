import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card, Empty, Muted, Screen } from '@/components/ui';
import { useData } from '@/data/store';
import { formatLongDate, plural } from '@/domain/format';
import { activeLogged } from '@/domain/history';
import { colors, fonts } from '@/theme';

export default function History() {
  const logged = useData((state) => state.logged);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  return (
    <Screen padTop={false}>
      {workouts.length ? null : <Empty title="Nothing yet" body="An empty history. Very mysterious. Very convenient." />}
      {workouts.map((workout) => (
        <Card key={workout.id} label={`Open ${workout.title}`} onPress={() => router.push(`/workout/logged/${workout.id}`)}>
          <Text style={styles.name}>{workout.title}</Text>
          <Muted>{formatLongDate(workout.date)} · {plural(workout.entries.length, 'exercise')}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink } });
