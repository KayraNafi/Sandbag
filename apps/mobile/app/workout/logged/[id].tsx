import { exerciseKey, voice } from '@sandbag/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { okToReplaceDraft } from '@/components/confirm';
import { toast } from '@/components/Toast';
import { BodyMap } from '@/components/BodyMap';
import { LiftRow } from '@/components/LiftRow';
import { PlaceMedal } from '@/components/Medal';
import { SessionTrend } from '@/components/SessionTrend';
import { CountUp } from '@/components/motion';
import { Button, Card, Muted, Row, Screen, ShowMore, Title, useShowMore } from '@/components/ui';
import { deleteLogged, startEdit, startRepeat } from '@/data/actions';
import { useData } from '@/data/store';
import { fitSize, formatLongDate, num, setsReps, summary } from '@/domain/format';
import { activeLogged, medalsFor, previewLoad, sameWorkoutSessions, volumeOf, trustedEntry } from '@/domain/history';
import { colors, fonts, space } from '@/theme';

const LIFTS_PAGE = 20;
const HERO_ROOM = 120;

export default function LoggedWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useData((state) => (id ? state.logged[id] : undefined));
  const logged = useData((state) => state.logged);
  const all = useMemo(() => activeLogged(logged), [logged]);
  const medals = useMemo(() => (workout ? medalsFor(all, workout) : []), [all, workout]);
  const sessions = useMemo(() => (workout ? sameWorkoutSessions(all, workout) : []), [all, workout]);
  const list = useShowMore(workout?.entries.length ?? 0, LIFTS_PAGE);
  const { width } = useWindowDimensions();
  if (!workout || workout.deleted) return null;
  const moved = volumeOf(workout);
  const minutes = workout.durationSeconds ? Math.max(1, Math.round(workout.durationSeconds / 60)) : null;

  return (
    <Screen padTop={false} footer={<Button title="Do this again" onPress={async () => {
      if (!(await okToReplaceDraft())) return;
      startRepeat(workout);
      router.push('/workout/active');
    }} />}>
      <View style={styles.hero}>
        <View style={styles.flex}>
          <Title>{workout.title}</Title>
          <Muted>{formatLongDate(workout.date)}</Muted>
          {moved ? (
            <View style={styles.moved}>
              <CountUp value={moved} commas style={[styles.movedNumber, { fontSize: fitSize(40, moved.toLocaleString('en-US').length, width - HERO_ROOM - 32) }]} />
              <Text style={styles.movedUnit}>KG MOVED{minutes ? ` · ${minutes} MIN` : ''}</Text>
            </View>
          ) : null}
        </View>
        <BodyMap size={56} levels={previewLoad(workout.entries)} />
      </View>
      {medals.length ? (
        <View style={styles.medals}>
          {medals.map((medal) => (
            <View key={medal.entry.id} style={styles.medal}>
              <PlaceMedal place={medal.place} size={40} />
              <Text numberOfLines={2} style={styles.medalName}>{medal.entry.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Card>
        {workout.entries.slice(0, list.shown).map((entry, index) => (
          <LiftRow
            key={entry.id}
            name={entry.name}
            delay={index * 50}
            detail={[entry.kind === 'time' ? summary(entry) : setsReps(entry), trustedEntry(entry) === entry ? null : 'Not counted', entry.note].filter(Boolean).join(' · ')}
            value={entry.kind === 'strength' && entry.weight !== null ? num(entry.weight) : null}
            onPress={() => router.push(`/exercise/${encodeURIComponent(exerciseKey(entry.name))}`)}
          />
        ))}
      </Card>
      <ShowMore left={list.left} page={list.page} onPress={list.more} />
      {sessions.length > 1 && moved ? (
        <View style={styles.trend}>
          <Text style={styles.movedUnit}>{workout.title.toUpperCase()} OVER TIME</Text>
          <SessionTrend sessions={sessions} workout={workout} ink={colors.volt} faded={colors.surface2} height={96} />
        </View>
      ) : null}
      <Button title="Make a card" onPress={() => router.push(`/workout/card/${workout.id}`)} />
      <Row>
        <View style={styles.flex}><Button title="Edit" variant="ghost" onPress={async () => {
          if (!(await okToReplaceDraft())) return;
          startEdit(workout);
          router.push('/workout/active');
        }} /></View>
        <View style={styles.flex}><Button title="Share" variant="ghost" onPress={() => router.push(`/share?loggedId=${workout.id}`)} /></View>
      </Row>
      <Button title="Delete session" variant="danger" onPress={() => {
        deleteLogged(workout);
        if (router.canGoBack()) router.back();
        else router.replace('/');
        toast(voice.deleted(Date.now()), () => useData.getState().putLogged({ ...workout, deleted: false }));
      }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  moved: { marginTop: space.sm },
  movedNumber: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.volt },
  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  medal: { flexDirection: 'row', alignItems: 'center', gap: space.sm, width: '46%' },
  medalName: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  trend: { gap: space.sm },
  movedUnit: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, color: colors.ink3 },
});
