import { kmText, type RankingPeriod, type RankingRow, type RunningStats, type WeekBonuses } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Avatar } from '@/components/Avatar';
import { CountUp, feel, GrowBar, GrowUp, Stamp } from '@/components/motion';
import { Button, Card, Empty, ListGroup, ListRow, Loading, Muted, Row, Screen, Segmented, Title } from '@/components/ui';
import { plural, signed, signedPoints } from '@/domain/format';
import { colors, fonts, radius, space } from '@/theme';

const PERIODS: { key: RankingPeriod; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: '30 days' },
  { key: 'all', label: 'All time' },
];

/** The one person to catch, on one track. A gap you can see says more than a rank. */
function Chase({ rows, myId }: { rows: RankingRow[]; myId: string | undefined }) {
  const at = rows.findIndex((row) => row.user.id === myId);
  const mine = rows[at];
  const above = rows[at - 1];
  const rival = above ?? rows[at + 1];
  if (!mine || !rival) return null;
  const gap = Math.abs(rival.score - mine.score);
  const name = rival.user.displayName.toUpperCase();
  return (
    <Card>
      <Row style={styles.chaseTop}>
        <CountUp value={gap} style={styles.chaseNumber} />
        <Text style={styles.chaseText}>{above ? (gap ? `TO CATCH ${name}` : `LEVEL WITH ${name}`) : `AHEAD OF ${name}`}</Text>
      </Row>
      <Row>
        <Avatar user={mine.user} size={36} />
        <View style={styles.flex}><GrowBar ratio={above ? mine.score / Math.max(1, above.score) : 1} color={colors.volt} delay={200} height={12} /></View>
        <Avatar user={rival.user} size={36} />
      </Row>
      <Muted>{above ? (gap ? 'Not that anyone’s counting.' : 'Awkward.') : 'Enjoy it, they can see this too.'}</Muted>
    </Card>
  );
}

// Tallest in the middle, the way a real podium stands.
const PODIUM_ORDER = [1, 0, 2];
const PODIUM_HEIGHT = [120, 88, 64];

function Podium({ rows, onPick }: { rows: RankingRow[]; onPick: (row: RankingRow) => void }) {
  return (
    <View style={styles.podium}>
      {PODIUM_ORDER.map((place) => {
        const row = rows[place];
        if (!row) return <View key={place} style={styles.step} />;
        return (
          <Pressable key={row.user.id} accessibilityRole="button" accessibilityLabel={`${row.rank}. ${row.user.displayName}, ${row.score} points`} onPress={() => onPick(row)} style={styles.step}>
            <Avatar user={row.user} size={place === 0 ? 64 : 52} />
            <Text numberOfLines={1} style={styles.podiumName}>{row.user.displayName}</Text>
            {row.wearingSandbag ? <Stamp delay={500}><Text style={styles.badge}>SANDBAG</Text></Stamp> : null}
            <GrowUp height={PODIUM_HEIGHT[place]!} delay={place * 90} style={[styles.block, place === 0 && styles.blockFirst]}>
              <View style={styles.blockInner}>
                <CountUp value={row.score} delay={place * 90} style={[styles.podiumScore, place === 0 && styles.podiumScoreFirst]} />
                <Text style={[styles.podiumRank, place === 0 && styles.podiumRankFirst]}>{row.rank}</Text>
              </View>
            </GrowUp>
          </Pressable>
        );
      })}
    </View>
  );
}

/** How one person's score was made, for the period on screen. */
function Breakdown({ row, period }: { row: RankingRow; period: RankingPeriod }) {
  const lines = period === 'all'
    ? [`${plural(row.workouts, 'day')} trained`]
    : [`Got stronger ${signed(row.progress)}`, period === 'week' ? `${row.workouts} of ${row.target} days trained` : `${plural(row.workouts, 'day')} trained`];
  if (row.streak) lines.push(`${plural(row.streak, 'week')} on target${row.shields ? ` · ${plural(row.shields, 'shield')}` : ''}`);
  if (row.bonuses?.total) lines.push(`Bonus ${signedPoints(row.bonuses.total)}: ${bonusText(row.bonuses)}`);
  if (row.running.points) lines.push(`Running ${signedPoints(row.running.points)}: ${runningText(row.running)}`);
  if (row.calls) lines.push(`Calls ${signedPoints(row.calls)}`);
  return (
    <Card>
      <Row style={styles.breakdownTop}>
        <Avatar user={row.user} size={36} />
        <Text style={[styles.name, styles.flex]}>{row.user.displayName}</Text>
        <Text style={styles.breakdownScore}>{row.score.toLocaleString('en-US')}</Text>
      </Row>
      {lines.map((line) => <Muted key={line}>{line}</Muted>)}
    </Card>
  );
}

/** What running points are made of, e.g. "14 km +12, pace +6". */
function runningText(running: RunningStats): string {
  return [`${kmText(running.km)} +${running.distance}`, running.pace ? `pace +${running.pace}` : ''].filter(Boolean).join(', ');
}

/** What a week's bonus is made of, e.g. "streak +3, new bests +4". */
function bonusText(bonuses: WeekBonuses): string {
  const parts: [string, number][] = [['streak', bonuses.streak], ['comeback', bonuses.comeback], ['over goal', bonuses.overGoal], ['new bests', bonuses.newBests]];
  return parts.filter(([, points]) => points).map(([name, points]) => `${name} +${points}`).join(', ');
}

export default function Rankings() {
  const [period, setPeriod] = useState<RankingPeriod>('week');
  const [picked, setPicked] = useState<string | null>(null);
  const me = useSession((state) => state.me);
  const rankings = useQuery({ queryKey: ['rankings', period], queryFn: () => api.rankings(period) });
  const rows = rankings.data ?? [];
  const top = Math.max(1, rows[0]?.score ?? 1);
  const rest = rows.length >= 2 ? rows.slice(3) : rows;
  const shown = rows.find((row) => row.user.id === (picked ?? me?.id));
  const pick = (row: RankingRow) => {
    feel.tap();
    setPicked(row.user.id);
  };

  return (
    <Screen onRefresh={() => rankings.refetch()}>
      <Title>Rankings</Title>
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      {rankings.isPending ? <Loading /> : null}
      {rankings.isError ? <Muted>Can’t load rankings right now.</Muted> : null}
      <Chase rows={rows} myId={me?.id} />
      {rows.length >= 2 ? <Podium rows={rows} onPick={pick} /> : null}
      {rest.map((row, index) => (
        <Pressable key={row.user.id} accessibilityRole="button" accessibilityLabel={`${row.rank}. ${row.user.displayName}, ${row.score} points`} onPress={() => pick(row)} style={styles.racer}>
          <Text style={styles.rank}>{row.rank}</Text>
          <Avatar user={row.user} size={40} />
          <View style={styles.racerMiddle}>
            <Row style={styles.racerName}>
              <Text numberOfLines={1} style={[styles.name, styles.flex]}>{row.user.displayName}</Text>
              {row.wearingSandbag ? <Text style={styles.badge}>SANDBAG</Text> : null}
            </Row>
            <GrowBar ratio={row.score / top} color={row.user.id === me?.id ? colors.volt : colors.ink3} delay={120 + index * 70} />
          </View>
          <CountUp value={row.score} delay={120 + index * 70} style={[styles.score, row.user.id === me?.id && styles.scoreMine]} />
        </Pressable>
      ))}
      {shown ? <Breakdown row={shown} period={period} /> : null}
      {rankings.isSuccess && rows.length < 2 ? (
        <>
          <Empty title="You’re winning" body="Out of one. Add someone before this gets sad." />
          <Button title="Bring witnesses" onPress={() => router.push('/invites')} />
        </>
      ) : null}
      <Muted>Tap anyone to see how their score was made.</Muted>
      <ListGroup>
        <ListRow icon="target" title="How points work" onPress={() => router.push('/scoring')} />
        <ListRow icon="bag" title="What’s sandbagging?" onPress={() => router.push('/about')} />
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chaseTop: { alignItems: 'flex-end', gap: space.sm },
  chaseNumber: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, color: colors.volt },
  chaseText: { flex: 1, fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.ink, marginBottom: space.sm },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.md },
  step: { flex: 1, alignItems: 'center', gap: space.xs },
  podiumName: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink, maxWidth: '100%' },
  block: { alignSelf: 'stretch', backgroundColor: colors.surface2, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  blockFirst: { backgroundColor: colors.volt },
  blockInner: { alignItems: 'center', paddingTop: space.sm },
  podiumScore: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.ink },
  podiumScoreFirst: { color: colors.voltInk, fontSize: 40, lineHeight: 48 },
  podiumRank: { fontFamily: fonts.label, fontSize: 13, color: colors.ink3 },
  podiumRankFirst: { color: colors.voltInk },
  racer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 60 },
  racerMiddle: { flex: 1, gap: 6 },
  racerName: { gap: space.xs },
  rank: { fontFamily: fonts.display, fontSize: 24, color: colors.ink3, width: 24, textAlign: 'center' },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  badge: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1, color: colors.warn },
  score: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.ink, minWidth: 44, textAlign: 'right' },
  scoreMine: { color: colors.volt },
  breakdownTop: { gap: space.sm, marginBottom: space.xs },
  breakdownScore: { fontFamily: fonts.display, fontSize: 28, color: colors.volt },
});
