import { believable, runHeadline, voice } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Muted, Screen, Title } from '@/components/ui';
import { useData } from '@/data/store';
import { activeRuns, pace, pbLine, pointsLine, runTitle } from '@/domain/runs';
import { colors, fonts } from '@/theme';

/** Where a new run lands: what it was worth, then the ways to show it off. */
export default function RunFinished() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const allRuns = useData((state) => state.runs);
  const run = id ? allRuns[id] : undefined;
  const others = useMemo(() => activeRuns(allRuns).filter((other) => other.id !== id && other.date <= (run?.date ?? '')), [allRuns, id, run?.date]);
  if (!run || run.deleted) return null;
  const pb = pbLine(run, others);
  const done = () => {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  };

  return (
    <Screen padTop={false} footer={(
      <>
        <Button title="Show the crew" onPress={() => router.push(`/share?runId=${run.id}`)} />
        <Button title="Make a card" variant="ghost" onPress={() => router.push(`/card?runId=${run.id}`)} />
        <Button title="Done" variant="ghost" onPress={done} />
      </>
    )}>
      <Title>{runTitle(run)}</Title>
      <Text style={styles.line}>{voice.runLogged(run.updatedAt)}</Text>
      <Muted>{runHeadline(run)}.</Muted>
      <Text style={styles.pace}>{pace(run)}</Text>
      {believable(run) ? <Muted>{pointsLine(run)}</Muted> : <Muted style={styles.warn}>{voice.tooFast()}</Muted>}
      {pb ? <Muted>{pb}</Muted> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: fonts.bodyStrong, fontSize: 18, lineHeight: 24, color: colors.volt },
  pace: { fontFamily: fonts.display, fontSize: 32, color: colors.volt },
  warn: { color: colors.warn },
});
