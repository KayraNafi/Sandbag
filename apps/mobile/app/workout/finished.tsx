import { goalsOf, savedExercisesOf, voice } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSession } from '@/auth/session';
import { toast } from '@/components/Toast';
import { Button, Card, Heading, Muted, Screen, Title } from '@/components/ui';
import { createSaved, updateSaved } from '@/data/actions';
import { useLastShown } from '@/data/shown';
import { useData } from '@/data/store';
import { newBests, streakOn } from '@/domain/card';
import { toIsoDate } from '@/domain/format';
import { activeLogged, buildHistory, sameExercises } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

export default function Finished() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logged = useData((state) => state.logged);
  const saved = useData((state) => state.saved);
  const workout = id ? logged[id] : undefined;
  const [handled, setHandled] = useState(false);
  const me = useSession((state) => state.me);
  const all = useMemo(() => activeLogged(logged), [logged]);
  const streak = useMemo(() => streakOn(all, me ? goalsOf(me) : 3, toIsoDate(new Date())), [all, me]);
  const bests = useMemo(() => (workout ? newBests(workout, buildHistory(all)) : []), [workout, all]);

  const lastShown = useLastShown(id ? { loggedWorkoutId: id } : null);
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
        <Button title={lastShown ? 'Show the crew again' : 'Show the crew'} variant={lastShown ? 'ghost' : undefined} onPress={() => router.push(`/share?loggedId=${workout.id}`)} />
        <Button title="Make a card" variant="ghost" onPress={() => router.push(`/card?loggedId=${workout.id}`)} />
        <Button title="Done" variant={lastShown ? undefined : 'ghost'} onPress={done} />
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
            createSaved(workout.title, savedExercisesOf(workout.entries));
            setHandled(true);
            toast('Saved. One less excuse.');
          }} />
        </Card>
      ) : null}
      {!handled && changed && source ? (
        <Card>
          <Heading>Update {source.name}?</Heading>
          <Muted>Today’s exercises, their order or supersets were different from the saved ones.</Muted>
          <Button title="Update saved workout" variant="ghost" onPress={() => {
            updateSaved(source, { exercises: savedExercisesOf(workout.entries) });
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
