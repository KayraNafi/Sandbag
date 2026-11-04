import { router } from 'expo-router';
import { Fragment, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, Empty, Label, Muted, Screen, ShowMore, useShowMore } from '@/components/ui';
import { useData } from '@/data/store';
import { formatLongDate, formatMonth, plural } from '@/domain/format';
import { activeLogged } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

export default function History() {
  const logged = useData((state) => state.logged);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  const { shown, left, more, page } = useShowMore(workouts.length);
  return (
    <Screen padTop={false}>
      {workouts.length ? null : (
        <>
          <Empty title="Nothing yet" body="An empty history. Very mysterious. Very convenient." />
          <Button title="Go lift something" onPress={() => router.navigate('/')} />
        </>
      )}
      {workouts.slice(0, shown).map((workout, index, list) => {
        // Newest first, so a heading goes wherever the month changes.
        const month = formatMonth(workout.date);
        const newMonth = index === 0 || formatMonth(list[index - 1]!.date) !== month;
        return (
          <Fragment key={workout.id}>
            {newMonth ? <Label style={index ? styles.month : undefined}>{month}</Label> : null}
            <Card label={`Open ${workout.title}`} onPress={() => router.push(`/workout/logged/${workout.id}`)}>
              <Text style={styles.name}>{workout.title}</Text>
              <Muted>{formatLongDate(workout.date)} · {plural(workout.entries.length, 'exercise')}</Muted>
            </Card>
          </Fragment>
        );
      })}
      <ShowMore left={left} page={page} onPress={more} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  month: { marginTop: space.md },
});
