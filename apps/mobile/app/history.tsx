import { voice } from '@sandbag/shared';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BodyMap } from '@/components/BodyMap';
import { SessionRow } from '@/components/LiftRow';
import { CountUp } from '@/components/motion';
import { Button, Empty, Label, Muted, Screen, ShowMore, useShowMore, Title } from '@/components/ui';
import { useData } from '@/data/store';
import { fitSize, plural } from '@/domain/format';
import { activeLogged, previewLoad, volumeOf } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

const monthOf = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const MARGINS = 32;
const BIG = 72;
const fittedStyle = (characters: number, room: number) => {
  const fontSize = fitSize(BIG, characters, room);
  return { fontSize, lineHeight: Math.round(fontSize * 1.08) };
};

export default function History() {
  const logged = useData((state) => state.logged);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  const total = useMemo(() => workouts.reduce((sum, workout) => sum + volumeOf(workout), 0), [workouts]);
  const { shown, left, more, page } = useShowMore(workouts.length);
  const { width } = useWindowDimensions();

  let month = '';
  return (
    <Screen padTop={false}>
      <Title>History</Title>
      {workouts.length ? (
        <View style={styles.hero}>
          {total > 0 ? (
            <>
              <CountUp value={total} commas style={[styles.total, fittedStyle(total.toLocaleString('en-US').length, width - MARGINS)]} />
              <Text style={styles.unit}>KG MOVED, ALL OF IT</Text>
              <Text style={styles.line}>{voice.lifted(total)}</Text>
            </>
          ) : null}
          <Muted>{plural(workouts.length, 'session')} on the record.</Muted>
        </View>
      ) : (
        <>
          <Empty title="Nothing yet" body="An empty history. Very mysterious. Very convenient." />
          <Button title="Go lift something" onPress={() => router.navigate('/')} />
        </>
      )}
      {workouts.slice(0, shown).flatMap((workout, index) => {
        const here = monthOf(workout.date);
        const heading = here === month ? [] : [<Label key={here} style={styles.month}>{here}</Label>];
        month = here;
        const moved = volumeOf(workout);
        return [...heading, (
          <SessionRow
            key={workout.id}
            date={workout.date}
            title={workout.title}
            detail={`${plural(workout.entries.length, 'lift')}${moved ? ` · ${moved.toLocaleString('en-US')} kg` : ''}`}
            delay={Math.min(index, 8) * 40}
            right={<BodyMap size={22} levels={previewLoad(workout.entries)} />}
            onPress={() => router.push(`/workout/logged/${workout.id}`)}
          />
        )];
      })}
      <ShowMore left={left} page={page} onPress={more} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 2, marginBottom: space.sm },
  total: { fontFamily: fonts.display, fontSize: 56, lineHeight: 68, color: colors.volt },
  unit: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.ink3 },
  line: { fontFamily: fonts.bodyStrong, fontSize: 17, lineHeight: 23, color: colors.ink, marginTop: space.sm },
  month: { marginTop: space.md },
});
