import { goalsOf } from '@sandbag/shared';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/auth/session';
import { CardMaker } from '@/components/CardMaker';
import { useData } from '@/data/store';
import { runCard, streakOn, workoutCard, type CardData } from '@/domain/card';
import { activeLogged, buildHistory } from '@/domain/history';
import { activeRuns } from '@/domain/runs';
import { colors, space } from '@/theme';

/** What a card is made of: the session or run asked for, weighed against everything logged before it. */
function useCard(): { data: CardData; seed: string } | null {
  const { loggedId, runId } = useLocalSearchParams<{ loggedId?: string; runId?: string }>();
  const logged = useData((state) => state.logged);
  const runs = useData((state) => state.runs);
  const me = useSession((state) => state.me);
  return useMemo(() => {
    const workout = loggedId ? logged[loggedId] : undefined;
    if (workout && !workout.deleted) {
      const all = activeLogged(logged);
      return { data: workoutCard(workout, { index: buildHistory(all), streak: streakOn(all, me ? goalsOf(me) : 3, workout.date) }), seed: workout.id };
    }
    const run = runId ? runs[runId] : undefined;
    if (run && !run.deleted) return { data: runCard(run, activeRuns(runs)), seed: run.id };
    return null;
  }, [loggedId, runId, logged, runs, me]);
}

/** The cards for a session or a run, whenever it deserves one. */
export default function CardScreen() {
  const card = useCard();
  const insets = useSafeAreaInsets();
  if (!card) return null;
  return (
    <View style={[styles.host, { paddingBottom: insets.bottom + space.md }]}>
      <CardMaker data={card.data} seed={card.seed} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: space.lg, backgroundColor: colors.bg },
});
