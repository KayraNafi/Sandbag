import { exercisesFor, goalIn, mondayOf, MUSCLES, trainedDates, weekStreak, type Muscle, type TrophyView } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Avatar } from '@/components/Avatar';
import { BodyMap, MUSCLE_NAMES, MuscleLegend } from '@/components/BodyMap';
import { Icon } from '@/components/icons';
import { LiftDeck } from '@/components/LiftDeck';
import { NextTrophy, TrophyGrid, TrophySheet } from '@/components/Medal';
import { CountUp, FadeIn, feel, Pop } from '@/components/motion';
import { Button, Card, Heading, ListGroup, ListRow, Muted, Row, Screen, Segmented } from '@/components/ui';
import { WeekDots, WeekGrid } from '@/components/WeekDots';
import { useData } from '@/data/store';
import { useSyncStatus } from '@/data/sync';
import { plural, toIsoDate } from '@/domain/format';
import { activeLogged, buildHistory, goalsFor, muscleLoad, muscleSets, neglected } from '@/domain/history';
import { liftProgress } from '@/domain/progress';
import { colors, fonts, space } from '@/theme';

const WEEKS_PER_SHIELD = 4;
const MAX_SHIELDS = 2;

/** The number that matters most, and what the next week earns. */
function StreakHero({ current, best, shields, trained, today }: { current: number; best: number; shields: number; trained: string[]; today: string }) {
  const toShield = WEEKS_PER_SHIELD - (current % WEEKS_PER_SHIELD);
  return (
    <Card style={styles.hero}>
      <Row style={styles.heroTop}>
        <Icon name="flame" size={44} color={colors.voltInk} />
        <CountUp value={current} style={styles.heroNumber} />
        <Text style={styles.heroUnit}>{current === 1 ? 'WEEK' : 'WEEKS'}{'\n'}RUNNING</Text>
        <View style={styles.flex} />
        <View style={styles.shields} accessibilityLabel={`${plural(shields, 'shield')}, best streak ${best}`}>
          <Row style={styles.shieldRow}>
            {Array.from({ length: MAX_SHIELDS }, (_, index) => (
              <Pop key={index} delay={200 + index * 120}>
                <Icon name="shield" size={24} color={index < shields ? colors.voltInk : 'rgba(13, 16, 2, 0.28)'} />
              </Pop>
            ))}
          </Row>
          <Text style={styles.heroSmall}>BEST {best}</Text>
        </View>
      </Row>
      <Text style={styles.heroLine}>{shields >= MAX_SHIELDS ? 'Both shields ready. Nothing can touch you.' : `${plural(toShield, 'more week')} earns a shield.`}</Text>
      <WeekDots trained={trained} today={today} onVolt />
    </Card>
  );
}

type Section = 'body' | 'weeks' | 'lifts' | 'trophies';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'body', label: 'Body' },
  { key: 'lifts', label: 'Lifts' },
  { key: 'weeks', label: 'Weeks' },
  { key: 'trophies', label: 'Trophies' },
];

const SHELF = 6;

export default function You() {
  const me = useSession((state) => state.me);
  const logged = useData((state) => state.logged);
  const pending = useData((state) => state.dirtyLogged.length + state.dirtySaved.length + state.outbox.length);
  const online = useSyncStatus((state) => state.online);
  const trophies = useQuery({ queryKey: ['trophies'], queryFn: api.trophies });
  const earned = trophies.data?.filter((trophy) => trophy.earnedAt);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  const index = useMemo(() => buildHistory(workouts), [workouts]);
  const progress = useMemo(() => liftProgress(index), [index]);
  const today = toIsoDate(new Date());
  const trained = useMemo(() => trainedDates(workouts), [workouts]);
  const goal = goalIn(goalsFor(me), today);
  const streak = useMemo(() => weekStreak(trained, goalsFor(me), today, me?.pausedWeeks), [trained, me, today]);
  const weekStart = mondayOf(today);
  const load = useMemo(() => muscleLoad(workouts.filter((workout) => workout.date >= weekStart)), [workouts, weekStart]);
  const missing = neglected(load, MUSCLES);
  const [picked, setPicked] = useState<Muscle | null>(null);
  const [section, setSection] = useState<Section>('body');
  const [openTrophy, setOpenTrophy] = useState<TrophyView | null>(null);
  const pickedSets = picked ? Math.round(muscleSets(workouts.filter((workout) => workout.date >= weekStart).flatMap((workout) => workout.entries))[picked] ?? 0) : 0;

  return (
    <Screen>
      <Row>
        <Pressable accessibilityRole="button" accessibilityLabel="Change your character" onPress={() => router.push('/avatar')}>
          <Avatar user={me} size={72} />
        </Pressable>
        <View style={styles.flex}>
          <Heading>{me?.displayName ?? 'You'}</Heading>
          <Muted>{me ? `@${me.username}` : 'Offline'}</Muted>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={6} onPress={() => router.push('/settings')} style={styles.gear}>
          <Icon name="gear" size={26} color={colors.ink} />
        </Pressable>
      </Row>

      {pending ? (
        <Muted>{pending} {pending === 1 ? 'change' : 'changes'} waiting to sync{online === false ? '. You’re offline, it’s safe on this phone.' : '.'}</Muted>
      ) : null}

      <StreakHero current={streak.current} best={streak.best} shields={streak.shields} trained={trained} today={today} />

      <Segmented options={SECTIONS} value={section} onChange={setSection} />

      {section === 'body' ? (
        <FadeIn key="body">
          <Card>
            <BodyMap levels={load} size={130} selected={picked} onPick={(muscle) => { feel.tap(); setPicked(picked === muscle ? null : muscle); }} />
            {picked ? (
              <FadeIn key={picked}>
                <Text style={styles.picked}>{MUSCLE_NAMES[picked]}: {pickedSets ? `about ${plural(pickedSets, 'set')} this week.` : 'nothing this week. It’s noticed.'}</Text>
                <Muted>Try {exercisesFor(picked, null, '').slice(0, 3).map((lift) => lift.name).join(', ')}.</Muted>
              </FadeIn>
            ) : (
              <>
                <MuscleLegend levels={load} />
                <Muted>
                  {Object.keys(load).length === 0 ? 'Nothing yet. It’s not going to light itself up.'
                    : missing.length === 0 ? 'Everything’s had some attention. Suspiciously thorough.'
                      : `Not touched yet: ${missing.slice(0, 4).map((muscle) => MUSCLE_NAMES[muscle].toLowerCase()).join(', ')}${missing.length > 4 ? ', and more' : ''}. Tap a muscle to see more.`}
                </Muted>
              </>
            )}
          </Card>
        </FadeIn>
      ) : null}

      {section === 'weeks' ? (
        <FadeIn key="weeks">
          <Card>
            <Muted>Goal: {plural(goal, 'day')} a week. {plural(workouts.length, 'workout')} logged.</Muted>
            <WeekGrid trained={trained} today={today} />
          </Card>
        </FadeIn>
      ) : null}

      {section === 'lifts' ? (
        <FadeIn key="lifts" style={styles.panel}>
          {progress.length
            ? <LiftDeck lifts={progress} />
            : <Card><Muted>Log a lift twice and it shows up here, with the plates on the bar.</Muted></Card>}
          {progress.length ? <Button title={`All ${plural(index.size, 'lift')}`} variant="ghost" onPress={() => router.push('/exercises')} /> : null}
        </FadeIn>
      ) : null}

      {section === 'trophies' ? (
        <FadeIn key="trophies" style={styles.panel}>
          <Card>
            {trophies.data ? <NextTrophy trophies={trophies.data} onOpen={setOpenTrophy} /> : <Muted>Can’t see the shelf right now.</Muted>}
          </Card>
          {trophies.data ? <TrophyGrid trophies={trophies.data} limit={SHELF} onOpen={setOpenTrophy} /> : null}
          <Button title={earned && trophies.data ? `The whole case, ${earned.length} of ${trophies.data.length}` : 'The whole case'} variant="ghost" onPress={() => router.push('/trophies')} />
        </FadeIn>
      ) : null}

      <ListGroup>
        <ListRow title="History" onPress={() => router.push('/history')} />
        <ListRow title="Bring witnesses" onPress={() => router.push('/invites')} />
        <ListRow title="What’s sandbagging?" onPress={() => router.push('/about')} />
      </ListGroup>

      <TrophySheet trophy={openTrophy} onClose={() => setOpenTrophy(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  picked: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink, marginBottom: space.xs },
  flex: { flex: 1 },
  gear: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  panel: { gap: space.md },
  hero: { backgroundColor: colors.volt, borderColor: colors.volt },
  heroTop: { alignItems: 'center', gap: space.xs },
  heroNumber: { fontFamily: fonts.display, fontSize: 72, lineHeight: 76, color: colors.voltInk },
  heroUnit: { fontFamily: fonts.label, fontSize: 15, lineHeight: 16, letterSpacing: 1, color: colors.voltInk, marginLeft: space.xs },
  shields: { alignItems: 'flex-end', gap: space.xs },
  shieldRow: { gap: 2 },
  heroSmall: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.voltInk },
  heroLine: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.voltInk },
});
