import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, Empty, Muted, Screen, ShowMore, useShowMore } from '@/components/ui';
import { useData } from '@/data/store';
import { agoText, summary } from '@/domain/format';
import { activeLogged, buildHistory } from '@/domain/history';
import { colors, fonts } from '@/theme';

export default function Exercises() {
  const logged = useData((state) => state.logged);
  const lifts = useMemo(
    () => [...buildHistory(activeLogged(logged)).values()].sort((a, b) => (b.log.at(-1)?.date ?? '').localeCompare(a.log.at(-1)?.date ?? '')),
    [logged],
  );
  const { shown, left, more, page } = useShowMore(lifts.length);
  return (
    <Screen padTop={false}>
      {lifts.length ? null : (
        <>
          <Empty title="Nothing yet" body="Log a workout and your lifts show up here." />
          <Button title="Go lift something" onPress={() => router.navigate('/')} />
        </>
      )}
      {lifts.slice(0, shown).map((lift) => {
        const last = lift.log.at(-1);
        return (
          <Card key={lift.key} label={`${lift.name} progress`} onPress={() => router.push(`/exercise/${encodeURIComponent(lift.key)}`)}>
            <Text style={styles.name}>{lift.name}</Text>
            {last ? <Muted>{summary(last)} · {agoText(last.date)}</Muted> : null}
          </Card>
        );
      })}
      <ShowMore left={left} page={page} onPress={more} />
    </Screen>
  );
}

const styles = StyleSheet.create({ name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink } });
