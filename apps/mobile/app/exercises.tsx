import { router } from 'expo-router';
import { useMemo } from 'react';
import { LiftRow } from '@/components/LiftRow';
import { Button, Card, Empty, Screen, ShowMore, Title, useShowMore } from '@/components/ui';
import { useData } from '@/data/store';
import { agoText, num, setsReps, summary } from '@/domain/format';
import { activeLogged, buildHistory } from '@/domain/history';

export default function Exercises() {
  const logged = useData((state) => state.logged);
  const lifts = useMemo(
    () => [...buildHistory(activeLogged(logged)).values()].sort((a, b) => (b.log.at(-1)?.date ?? '').localeCompare(a.log.at(-1)?.date ?? '')),
    [logged],
  );
  const list = useShowMore(lifts.length);
  return (
    <Screen padTop={false}>
      <Title>Every lift</Title>
      {lifts.length ? null : (
        <>
          <Empty title="Nothing yet" body="Log a workout and your lifts show up here." />
          <Button title="Go lift something" onPress={() => router.navigate('/')} />
        </>
      )}
      {lifts.length ? (
        <Card>
          {lifts.slice(0, list.shown).map((lift, index) => {
            const last = lift.log.at(-1);
            return (
              <LiftRow
                key={lift.key}
                name={lift.name}
                delay={Math.min(index, 8) * 40}
                detail={last ? `${setsReps(last) || summary(last)} · ${agoText(last.date)}` : undefined}
                value={last?.weight ? num(last.weight) : null}
                onPress={() => router.push(`/exercise/${encodeURIComponent(lift.key)}`)}
              />
            );
          })}
        </Card>
      ) : null}
      <ShowMore left={list.left} page={list.page} onPress={list.more} />
    </Screen>
  );
}
