import { trainedDates, weekStreak } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Card, Heading, Muted, Row, Screen } from '@/components/ui';
import { useData } from '@/data/store';
import { useSyncStatus } from '@/data/sync';
import { toIsoDate } from '@/domain/format';
import { activeLogged, buildHistory } from '@/domain/history';
import { liftProgress } from '@/domain/progress';
import { Sparkline } from '@/components/Sparkline';
import { num, signed } from '@/domain/format';
import { Avatar } from '@/components/Avatar';
import { colors, fonts, space } from '@/theme';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Muted style={styles.center}>{label}</Muted>
    </View>
  );
}

const SHOWN_LIFTS = 5;

const LINKS: { title: string; body: string; href: Href }[] = [
  { title: 'History', body: 'Everything you’ve logged', href: '/history' },
  { title: 'Bring witnesses', body: 'Invites and recruiters', href: '/invites' },
  { title: 'What’s sandbagging?', body: 'The rules, and the shame', href: '/about' },
  { title: 'Settings', body: 'Target, password, your data', href: '/settings' },
];

export default function You() {
  const me = useSession((state) => state.me);
  const logged = useData((state) => state.logged);
  const pending = useData((state) => state.dirtyLogged.length + state.dirtySaved.length + state.outbox.length);
  const online = useSyncStatus((state) => state.online);
  const invites = useQuery({ queryKey: ['invites'], queryFn: api.invites });
  const trophies = useQuery({ queryKey: ['trophies'], queryFn: api.trophies });
  const earned = trophies.data?.filter((trophy) => trophy.earnedAt);
  const workouts = useMemo(() => activeLogged(logged), [logged]);
  const index = useMemo(() => buildHistory(workouts), [workouts]);
  const lifts = index.size;
  const progress = useMemo(() => liftProgress(index), [index]);
  const weekAgo = toIsoDate(new Date(Date.now() - 6 * 86_400_000));
  const thisWeek = workouts.filter((workout) => workout.date >= weekAgo).length;
  const streak = useMemo(
    () => weekStreak(trainedDates(workouts), me?.weeklyTarget ?? 3, toIsoDate(new Date())),
    [workouts, me?.weeklyTarget],
  );

  return (
    <Screen>
      <Row>
        <Pressable accessibilityRole="button" accessibilityLabel="Change your character" onPress={() => router.push('/avatar')}>
          <Avatar user={me} size={72} />
          <Text style={styles.change}>CHANGE</Text>
        </Pressable>
        <View style={styles.flex}>
          <Heading>{me?.displayName ?? 'You'}</Heading>
          <Muted>{me ? `@${me.username}` : 'Offline'}</Muted>
        </View>
      </Row>
      <Row style={styles.stats}>
        <Stat value={`${thisWeek}/${me?.weeklyTarget ?? '–'}`} label="Last 7 days" />
        <Stat value={workouts.length} label="Workouts" />
        <Stat value={streak.current} label="Streak" />
        <Stat value={invites.data?.joined ?? '–'} label="Recruits" />
      </Row>
      <Muted>
        {streak.current ? `${streak.current} ${streak.current === 1 ? 'week' : 'weeks'} in a row at ${me?.weeklyTarget ?? 3}+ workouts. ` : `Hit ${me?.weeklyTarget ?? 3} workouts in a week to start a streak. `}
        Best: {streak.best}.
      </Muted>
      <Card label="Trophies" onPress={() => router.push('/trophies')}>
        <Row style={styles.section}>
          <Text style={styles.linkTitle}>Trophies</Text>
          <Text style={styles.link}>{earned && trophies.data ? `${earned.length} of ${trophies.data.length}` : '–'}</Text>
        </Row>
        <Muted>{earned?.length ? earned.slice(-3).map((trophy) => trophy.name).join(', ') : 'Nothing yet. They’re not hard. That’s the insult.'}</Muted>
      </Card>
      {pending ? (
        <Muted>{pending} {pending === 1 ? 'change' : 'changes'} waiting to sync{online === false ? '. You’re offline, it’s safe on this phone.' : '.'}</Muted>
      ) : null}
      <Row style={styles.section}>
        <Heading>Progress</Heading>
        {progress.length ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/exercises')}>
            <Text style={styles.link}>{lifts === 1 ? 'All 1 lift' : `All ${lifts} lifts`}</Text>
          </Pressable>
        ) : null}
      </Row>
      {progress.length ? null : <Muted>Log a lift twice and its trend shows up here.</Muted>}
      {progress.slice(0, SHOWN_LIFTS).map((lift) => (
        <Card key={lift.key} label={`${lift.name}, ${signed(lift.change)} since you started`} onPress={() => router.push(`/exercise/${encodeURIComponent(lift.key)}`)}>
          <Row>
            <View style={styles.flex}>
              <Text style={styles.linkTitle}>{lift.name}</Text>
              <Muted>{num(lift.first)} → {num(lift.latest)} {lift.unit}</Muted>
            </View>
            <Sparkline values={lift.points.map((point) => point.value)} />
            <Text style={styles.change2}>{signed(lift.change)}</Text>
          </Row>
        </Card>
      ))}
      {LINKS.map((link) => (
        <Card key={link.title} label={link.title} onPress={() => router.push(link.href)}>
          <Text style={styles.linkTitle}>{link.title}</Text>
          <Muted>{link.body}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  section: { justifyContent: 'space-between', marginTop: space.sm },
  link: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt },
  change: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.volt, textAlign: 'center', marginTop: 4 },
  change2: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, minWidth: 62, textAlign: 'right' },
  stats: { alignItems: 'stretch', marginVertical: space.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingVertical: space.md, paddingHorizontal: space.xs, alignItems: 'center' },
  statValue: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  linkTitle: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
});
