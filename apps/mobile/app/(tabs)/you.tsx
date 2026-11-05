import { MAX_SHIELDS, WEEKS_PER_SHIELD, type TrophyView } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/icons';
import { NextTrophy, TrophyGrid, TrophySheet } from '@/components/Medal';
import { CountUp, FadeIn, Pop } from '@/components/motion';
import { Sparkline } from '@/components/Sparkline';
import { Button, Card, Heading, ListGroup, ListRow, Muted, Row, Screen, Segmented } from '@/components/ui';
import { WeekGrid, WeekStrip } from '@/components/WeekStrip';
import { useData } from '@/data/store';
import { useSyncStatus } from '@/data/sync';
import { num, plural, signed } from '@/domain/format';
import { activeLogged, buildHistory } from '@/domain/history';
import { liftProgress } from '@/domain/progress';
import { useWeek } from '@/domain/week';
import { colors, fonts, space } from '@/theme';

type Section = 'lifts' | 'weeks' | 'trophies';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'lifts', label: 'Lifts' },
  { key: 'weeks', label: 'Weeks' },
  { key: 'trophies', label: 'Trophies' },
];

const SHOWN_LIFTS = 5;
/** Ink on volt, faded: something not earned yet. */
const FADED = 'rgba(13, 16, 2, 0.28)';
const SHELF = 6;

/** The streak, the shields, and what the next weeks earn. */
function StreakHero({ current, best, shields, dates, today }: { current: number; best: number; shields: number; dates: string[]; today: string }) {
  const toShield = WEEKS_PER_SHIELD - (current % WEEKS_PER_SHIELD);
  return (
    <Card style={styles.hero}>
      <Row style={styles.heroTop}>
        <Icon name="flame" size={44} color={current ? colors.voltInk : FADED} />
        <CountUp value={current} style={styles.heroNumber} />
        <Text style={styles.heroUnit}>{current === 1 ? 'WEEK' : 'WEEKS'}{'\n'}RUNNING</Text>
        <View style={styles.flex} />
        <View style={styles.shields} accessible accessibilityLabel={`${plural(shields, 'shield')}, best streak ${best}`}>
          <Row style={styles.shieldRow}>
            {Array.from({ length: MAX_SHIELDS }, (_, index) => (
              <Pop key={index} delay={200 + index * 120}>
                <Icon name="shield" size={24} color={index < shields ? colors.voltInk : FADED} />
              </Pop>
            ))}
          </Row>
          <Text style={styles.heroSmall}>BEST {best}</Text>
        </View>
      </Row>
      <Text style={styles.heroLine}>
        {!current ? 'Hit your goal this week to start a streak.'
          : shields >= MAX_SHIELDS ? 'Both shields ready. A missed week can’t touch you.'
            : `${plural(toShield, 'more week')} on goal earns a shield.`}
      </Text>
      <WeekStrip dates={dates} today={today} onVolt />
    </Card>
  );
}

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
  const week = useWeek(workouts);
  const [section, setSection] = useState<Section>('lifts');
  const [openTrophy, setOpenTrophy] = useState<TrophyView | null>(null);

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
          <Icon name="gear" size={26} />
        </Pressable>
      </Row>

      {pending ? (
        <Muted>{pending} {pending === 1 ? 'change' : 'changes'} waiting to sync{online === false ? '. You’re offline, it’s safe on this phone.' : '.'}</Muted>
      ) : null}

      <StreakHero current={week.streak.current} best={week.streak.best} shields={week.streak.shields} dates={week.dates} today={week.today} />

      <Segmented options={SECTIONS} value={section} onChange={setSection} />

      {section === 'lifts' ? (
        <FadeIn key="lifts" style={styles.panel}>
          {progress.length ? null : <Card><Muted>Log a lift twice and its trend shows up here.</Muted></Card>}
          {progress.slice(0, SHOWN_LIFTS).map((lift) => (
            <Card key={lift.key} label={`${lift.name}, ${signed(lift.change)} since you started`} onPress={() => router.push(`/exercise/${encodeURIComponent(lift.key)}`)}>
              <Row>
                <View style={styles.flex}>
                  <Text style={styles.liftName}>{lift.name}</Text>
                  <Muted>{num(lift.first)} → {num(lift.latest)} {lift.unit}</Muted>
                </View>
                <Sparkline values={lift.points.map((point) => point.value)} />
                <Text style={styles.change}>{signed(lift.change)}</Text>
              </Row>
            </Card>
          ))}
          {index.size > SHOWN_LIFTS ? <Button title={`See all ${index.size} lifts`} variant="ghost" onPress={() => router.push('/exercises')} /> : null}
        </FadeIn>
      ) : null}

      {section === 'weeks' ? (
        <FadeIn key="weeks">
          <Card>
            <Muted>Goal: {plural(week.goal, 'day')} a week. {plural(workouts.length, 'workout')} logged.</Muted>
            <WeekGrid dates={week.dates} today={week.today} />
          </Card>
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
  liftName: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  change: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, minWidth: 62, textAlign: 'right' },
});
