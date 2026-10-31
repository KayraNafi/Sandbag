import { exerciseKey } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { confirm } from '@/components/confirm';
import { Button, Card, Muted, Row, Screen, Title } from '@/components/ui';
import { deleteLogged, startEdit, startRepeat } from '@/data/actions';
import { useData } from '@/data/store';
import { formatLongDate, summary } from '@/domain/format';
import { colors, fonts } from '@/theme';

export default function LoggedWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useData((state) => (id ? state.logged[id] : undefined));
  if (!workout || workout.deleted) return null;

  return (
    <Screen padTop={false} footer={<Button title="Do this again" onPress={() => {
      startRepeat(workout);
      router.push('/workout/active');
    }} />}>
      <Title>{workout.title}</Title>
      <Muted>{formatLongDate(workout.date)}</Muted>
      {workout.entries.map((entry) => (
        <Card key={entry.id} label={`${entry.name} progress`} onPress={() => router.push(`/exercise/${encodeURIComponent(exerciseKey(entry.name))}`)}>
          <Text style={styles.name}>{entry.name}</Text>
          <Muted>{summary(entry)}</Muted>
          {entry.note ? <Muted>{entry.note}</Muted> : null}
        </Card>
      ))}
      <Row>
        <View style={styles.flex}><Button title="Edit" variant="ghost" onPress={() => {
          startEdit(workout);
          router.push('/workout/active');
        }} /></View>
        <View style={styles.flex}><Button title="Share" variant="ghost" onPress={() => router.push(`/share?loggedId=${workout.id}`)} /></View>
      </Row>
      <Button title="Delete session" variant="danger" onPress={async () => {
        if (await confirm('Delete this session?', 'It disappears from your history, charts and rankings.', 'Delete')) {
          deleteLogged(workout);
          router.back();
        }
      }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
});
