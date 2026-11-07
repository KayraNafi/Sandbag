import { exerciseKey } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { toast } from '@/components/Toast';
import { begin, leave } from '@/nav';
import { Button, Card, Muted, Row, Screen, Title } from '@/components/ui';
import { deleteLogged, startEdit, startRepeat } from '@/data/actions';
import { useData } from '@/data/store';
import { formatLongDate, summary } from '@/domain/format';
import { colors, fonts } from '@/theme';
import { SupersetList } from '@/components/Superset';

export default function LoggedWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useData((state) => (id ? state.logged[id] : undefined));
  if (!workout || workout.deleted) return null;

  return (
    <Screen padTop={false} footer={<Button title="Do this again" onPress={() => void begin(() => startRepeat(workout))} />}>
      <Title>{workout.title}</Title>
      <Muted>{formatLongDate(workout.date)}</Muted>
      <SupersetList items={workout.entries} keyOf={(entry) => entry.id}>{(entry) => (
        <Card label={`${entry.name} progress`} onPress={() => router.push(`/exercise/${encodeURIComponent(exerciseKey(entry.name))}`)}>
          <Text style={styles.name}>{entry.name}</Text>
          <Muted>{summary(entry)}</Muted>
          {entry.note ? <Muted>{entry.note}</Muted> : null}
        </Card>
      )}</SupersetList>
      <Row>
        <View style={styles.flex}><Button title="Edit" variant="ghost" onPress={() => void begin(() => startEdit(workout))} /></View>
        <View style={styles.flex}><Button title="Share" variant="ghost" onPress={() => router.push(`/share?loggedId=${workout.id}`)} /></View>
      </Row>
      <Button title="Delete session" variant="danger" onPress={() => {
        const undo = deleteLogged(workout);
        leave();
        toast('Session deleted.', undo);
      }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
});
