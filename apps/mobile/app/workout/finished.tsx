import { trainedDates, voice, weekStreak } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/auth/session';
import { toast } from '@/components/Toast';
import { Button, Card, Heading, Muted, Screen, Title } from '@/components/ui';
import { createSaved, updateSaved } from '@/data/actions';
import { useData } from '@/data/store';
import { num, toIsoDate } from '@/domain/format';
import { activeLogged, bestBefore, buildHistory, metricOf, sameExercises, toSavedExercises } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

export default function Finished() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logged = useData((state) => state.logged);
  const saved = useData((state) => state.saved);
  const workout = id ? logged[id] : undefined;
  const [handled, setHandled] = useState(false);
  const target = useSession((state) => state.me?.weeklyTarget ?? 3);
  const streak = useMemo(
    () => weekStreak(trainedDates(activeLogged(logged)), target, toIsoDate(new Date())).current,
    [logged, target],
  );

  const bests = useMemo(() => {
    if (!workout) return [];
    const index = buildHistory(activeLogged(logged));
    return workout.entries.flatMap((entry) => {
      const value = metricOf(entry);
      const previous = bestBefore(index, entry.name, workout.date);
      return value !== null && previous !== null && value > previous
        ? [{ name: entry.name, text: `${num(previous)} → ${num(value)} ${entry.kind === 'time' ? 'min' : 'kg'}` }]
        : [];
    });
  }, [workout, logged]);

  if (!workout) return null;
  const source = workout.savedWorkoutId ? saved[workout.savedWorkoutId] : undefined;
  const changed = source && !source.deleted && !sameExercises(source.exercises, workout.entries);
  const unsaved = !source || source.deleted;
  const done = () => {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  };

  return (
    <Screen padTop={false} footer={(
      <>
        <Button title="Show the crew" onPress={() => router.push(`/share?loggedId=${workout.id}`)} />
        <Button title="Done" variant="ghost" onPress={done} />
      </>
    )}>
      <Title>{workout.title}</Title>
      <Text style={styles.line}>{bests.length ? voice.finished() : voice.noBest()}</Text>
      {streak > 1 ? <Muted>{voice.streak(streak)}</Muted> : null}
      {bests.length ? (
        <Card>
          <Heading>New bests</Heading>
          {bests.map((best) => (
            <View key={best.name} style={styles.best}>
              <Text style={styles.bestName}>{best.name}</Text>
              <Muted>{best.text}</Muted>
            </View>
          ))}
        </Card>
      ) : null}
      {!handled && unsaved ? (
        <Card>
          <Heading>Save this workout?</Heading>
          <Muted>Next time it starts with one tap, loaded with your numbers.</Muted>
          <Button title="Save" variant="ghost" onPress={() => {
            createSaved(workout.title, toSavedExercises(workout.entries));
            setHandled(true);
            toast('Saved. One less excuse.');
          }} />
        </Card>
      ) : null}
      {!handled && changed && source ? (
        <Card>
          <Heading>Update {source.name}?</Heading>
          <Muted>Today’s exercises or their order were different from the saved ones.</Muted>
          <Button title="Update saved workout" variant="ghost" onPress={() => {
            updateSaved(source, { exercises: toSavedExercises(workout.entries) });
            setHandled(true);
            toast('Updated.');
          }} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: fonts.bodyStrong, fontSize: 18, lineHeight: 24, color: colors.volt },
  best: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  bestName: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
});
