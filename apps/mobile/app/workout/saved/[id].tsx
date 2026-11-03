import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BodyMap } from '@/components/BodyMap';
import { okToReplaceDraft } from '@/components/confirm';
import { toast } from '@/components/Toast';
import { LiftRow, SessionRow } from '@/components/LiftRow';
import { Button, Card, Heading, Muted, Row, Screen, Title } from '@/components/ui';
import { deleteSaved, startFromSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { agoText, num, plural, setsReps, summary } from '@/domain/format';
import { activeLogged, buildHistory, lastLogged, previewLoad } from '@/domain/history';
import { space } from '@/theme';

export default function SavedWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useData((state) => (id ? state.saved[id] : undefined));
  const logged = useData((state) => state.logged);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  const index = useMemo(() => buildHistory(workouts), [workouts]);
  if (!workout || workout.deleted) return null;
  const sessions = workouts.filter((item) => item.savedWorkoutId === workout.id);

  return (
    <Screen padTop={false} footer={<Button title="Start" onPress={async () => {
      if (!(await okToReplaceDraft())) return;
      startFromSaved(workout);
      router.push('/workout/active');
    }} />}>
      <View style={styles.hero}>
        <View style={styles.flex}>
          <Title>{workout.name}</Title>
          <Muted>{workout.savedFrom ? `From ${workout.savedFrom}. The numbers are all yours.` : `${plural(sessions.length, 'session')} so far.`}</Muted>
        </View>
        <BodyMap size={56} levels={previewLoad(workout.exercises)} />
      </View>
      <Card>
        {workout.exercises.map((exercise, position) => {
          const last = lastLogged(index, exercise.name);
          return (
            <LiftRow
              key={`${exercise.name}-${position}`}
              name={exercise.name}
              delay={position * 50}
              detail={last ? setsReps(last) || summary(last) : setsReps(exercise) || 'No numbers yet'}
              value={last?.weight ? num(last.weight) : null}
            />
          );
        })}
      </Card>
      <Row>
        <View style={styles.flex}><Button title="Edit" variant="ghost" onPress={() => router.push(`/workout/edit/${workout.id}`)} /></View>
        <View style={styles.flex}><Button title="Share" variant="ghost" disabled={!workout.exercises.length} onPress={() => router.push(`/share?savedId=${workout.id}`)} /></View>
      </Row>
      {sessions.length ? <Heading section>History</Heading> : null}
      {sessions.map((session, position) => (
        <SessionRow
          key={session.id}
          date={session.date}
          title={agoText(session.date)}
          detail={plural(session.entries.length, 'lift')}
          delay={Math.min(position, 8) * 40}
          onPress={() => router.push(`/workout/logged/${session.id}`)}
        />
      ))}
      <Button title="Delete workout" variant="danger" onPress={() => {
        deleteSaved(workout);
        if (router.canGoBack()) router.back();
        else router.replace('/');
        toast(`${workout.name} deleted. Your sessions stay.`, () => useData.getState().putSaved({ ...workout, deleted: false }));
      }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
