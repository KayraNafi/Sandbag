import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { toast } from '@/components/Toast';
import { beginSaved, leave } from '@/nav';
import { Button, Card, Heading, Muted, Row, Screen, Title } from '@/components/ui';
import { deleteSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { agoText, formatDate, setsReps, summary } from '@/domain/format';
import { activeLogged, buildHistory, lastLogged } from '@/domain/history';
import { colors, fonts } from '@/theme';

export default function SavedWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useData((state) => (id ? state.saved[id] : undefined));
  const logged = useData((state) => state.logged);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  const index = useMemo(() => buildHistory(workouts), [workouts]);
  if (!workout || workout.deleted) return null;
  const sessions = workouts.filter((item) => item.savedWorkoutId === workout.id);

  return (
    <Screen padTop={false} footer={<Button title="Start" onPress={() => void beginSaved(workout)} />}>
      <Title>{workout.name}</Title>
      {workout.savedFrom ? <Muted>From {workout.savedFrom}. The numbers are all yours.</Muted> : null}
      {workout.exercises.map((exercise, position) => {
        const last = lastLogged(index, exercise.name);
        return (
          <Card key={`${exercise.name}-${position}`}>
            <Text style={styles.name}>{exercise.name}</Text>
            <Muted>{last ? `Last: ${summary(last)}` : setsReps(exercise) || 'No numbers yet'}</Muted>
          </Card>
        );
      })}
      <Row>
        <View style={styles.flex}><Button title="Edit" variant="ghost" onPress={() => router.push(`/workout/edit/${workout.id}`)} /></View>
        <View style={styles.flex}><Button title="Share" variant="ghost" disabled={!workout.exercises.length} onPress={() => router.push(`/share?savedId=${workout.id}`)} /></View>
      </Row>
      {sessions.length ? <Heading>History</Heading> : null}
      {sessions.map((session) => (
        <Card key={session.id} label={`Session on ${formatDate(session.date)}`} onPress={() => router.push(`/workout/logged/${session.id}`)}>
          <Text style={styles.name}>{formatDate(session.date)}</Text>
          <Muted>{agoText(session.date)} · {session.entries.length} exercises</Muted>
        </Card>
      ))}
      <Button title="Delete workout" variant="danger" onPress={() => {
        const undo = deleteSaved(workout);
        leave();
        toast(`${workout.name} deleted. Your sessions stay.`, undo);
      }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
});
